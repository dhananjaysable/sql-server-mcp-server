import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import sql from "mssql/msnodesqlv8.js";
import { z } from "zod";
import * as dotenv from "dotenv";
dotenv.config();
const config = {
    // Connection to Application Database (from .env or hardcoded fallback)
    connectionString: process.env.DB_CONNECTION_STRING
};
const server = new Server({
    name: "mssql-read-only-server",
    version: "1.0.0",
}, {
    capabilities: { tools: {} },
});
// Tool Definitions
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "query_database",
            description: "Execute a SELECT query. Only SELECT statements are allowed.",
            inputSchema: {
                type: "object",
                properties: { sql: { type: "string" } },
                required: ["sql"]
            }
        },
        {
            name: "list_tables",
            description: "List all tables, views, and schemas in the database",
            inputSchema: { type: "object", properties: {} }
        },
        {
            name: "search_database_objects",
            description: "Search for tables, views, and stored procedures by name (fuzzy match)",
            inputSchema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search term for object names" }
                },
                required: ["query"]
            }
        },
        {
            name: "get_table_detailed_metadata",
            description: "Get detailed metadata for a specific table including columns, primary keys, and foreign key relationships",
            inputSchema: {
                type: "object",
                properties: {
                    table: { type: "string", description: "Table name (without schema)" },
                    schema: { type: "string", description: "Schema name (optional, defaults to 'dbo')" }
                },
                required: ["table"]
            }
        },
        {
            name: "get_database_summary",
            description: "Get high-level statistics about the database (object counts, versions, etc.)",
            inputSchema: { type: "object", properties: {} }
        }
    ],
}));
// Tool Logic
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const pool = await sql.connect(config);
    const { name, arguments: args } = request.params;
    try {
        if (name === "query_database") {
            const query = args?.sql;
            if (!query.toLowerCase().trim().startsWith("select")) {
                throw new Error("Only SELECT queries are allowed for security.");
            }
            const result = await pool.request().query(query);
            return { content: [{ type: "text", text: JSON.stringify(result.recordset, null, 2) }] };
        }
        if (name === "list_tables") {
            const result = await pool.request().query(`
                SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE 
                FROM INFORMATION_SCHEMA.TABLES 
                ORDER BY TABLE_SCHEMA, TABLE_NAME`);
            return { content: [{ type: "text", text: JSON.stringify(result.recordset, null, 2) }] };
        }
        if (name === "search_database_objects") {
            const query = args?.query;
            const result = await pool.request()
                .input('search', sql.VarChar, `%${query}%`)
                .query(`
                    SELECT TABLE_SCHEMA as [Schema], TABLE_NAME as [Name], TABLE_TYPE as [Type]
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_NAME LIKE @search
                    UNION ALL
                    SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE
                    FROM INFORMATION_SCHEMA.ROUTINES
                    WHERE ROUTINE_NAME LIKE @search
                    ORDER BY 2
                `);
            return { content: [{ type: "text", text: JSON.stringify(result.recordset, null, 2) }] };
        }
        if (name === "get_database_summary") {
            const result = await pool.request().query(`
                SELECT 
                    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE') as TableCount,
                    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.VIEWS) as ViewCount,
                    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE') as ProcedureCount,
                    @@VERSION as Version
            `);
            return { content: [{ type: "text", text: JSON.stringify(result.recordset[0], null, 2) }] };
        }
        if (name === "get_table_detailed_metadata") {
            const tableName = args?.table;
            const schemaName = args?.schema || 'dbo';
            // 1. Columns
            const cols = await pool.request()
                .input('t1', sql.VarChar, tableName)
                .input('s1', sql.VarChar, schemaName)
                .query(`
                    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = @t1 AND TABLE_SCHEMA = @s1
                    ORDER BY ORDINAL_POSITION
                `);
            // 2. Foreign Keys (Outgoing relationships - what this table references)
            const fks = await pool.request()
                .input('t2', sql.VarChar, tableName)
                .input('s2', sql.VarChar, schemaName)
                .query(`
                    SELECT 
                        fk.name AS ForeignKeyName,
                        OBJECT_NAME(fkc.parent_object_id) AS TableName,
                        col.name AS ColumnName,
                        OBJECT_NAME(fkc.referenced_object_id) AS ReferencedTable,
                        ref_col.name AS ReferencedColumn
                    FROM sys.foreign_keys AS fk
                    INNER JOIN sys.foreign_key_columns AS fkc ON fk.object_id = fkc.constraint_object_id
                    INNER JOIN sys.columns AS col ON fkc.parent_object_id = col.object_id AND fkc.parent_column_id = col.column_id
                    INNER JOIN sys.columns AS ref_col ON fkc.referenced_object_id = ref_col.object_id AND fkc.referenced_column_id = ref_col.column_id
                    WHERE OBJECT_NAME(fkc.parent_object_id) = @t2 AND SCHEMA_NAME(fk.schema_id) = @s2
                `);
            // 3. Primary Key
            const pk = await pool.request()
                .input('t3', sql.VarChar, tableName)
                .input('s3', sql.VarChar, schemaName)
                .query(`
                    SELECT tc.CONSTRAINT_NAME, ccu.COLUMN_NAME
                    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                    JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu ON tc.CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
                    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = @t3 AND tc.TABLE_SCHEMA = @s3

                `);
            const metadata = {
                table: `${schemaName}.${tableName}`,
                columns: cols.recordset,
                primaryKey: pk.recordset,
                foreignKeys: fks.recordset
            };
            return { content: [{ type: "text", text: JSON.stringify(metadata, null, 2) }] };
        }
        throw new Error(`Tool not found: ${name}`);
    }
    catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
});
// Start Server
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map
