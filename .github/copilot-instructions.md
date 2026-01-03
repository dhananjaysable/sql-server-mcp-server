# SQL Server MCP Server - AI Coding Agent Instructions

## Project Overview
This is a **Model Context Protocol (MCP) Server** that exposes SQL Server databases as tools for AI agents. The server implements a read-only interface to query and explore SQL Server databases safely, with built-in security restrictions.

**Key Architecture**: 
- Entry point: [index.ts](../index.ts) - Standalone MCP server using stdio transport
- Provides 5 tools: database queries (SELECT-only), table/view listing, object search, metadata retrieval, and database summaries
- Security: All query inputs are validated; non-SELECT statements are rejected with error: `"Only SELECT queries are allowed for security."`

## Build & Runtime
- **TypeScript Compilation**: `npx tsc` compiles `.ts` → `.js` + `.d.ts` + sourcemaps
- **Language Runtime**: Node.js ES modules (type: "module" in package.json)
- **Key Dependencies**:
  - `@modelcontextprotocol/sdk` (v1.25.1) - MCP protocol implementation
  - `mssql` (v12.2.0) - Primary SQL Server driver with connection pooling
  - `msnodesqlv8` (v5.1.3) - Native ODBC driver (used as mssql backend)
  - `zod` (v4.3.4) - Runtime schema validation (not yet utilized)

## Connection Patterns
SQL Server connections use **named-pipe ODBC strings**, not config objects:
```typescript
// Correct: Use connectionString with ODBC driver
const config = { connectionString: "Driver={ODBC Driver 17 for SQL Server};Server=STPAMITDT02\\SA;Database=MyAppDb;Uid=mcp_user;Pwd=mcp@890;Trusted_Connection=no;Encrypt=no;" };
await sql.connect(config as any);  // Note: 'as any' cast required for type mismatch

// Tested connection verified in test-connection.js
```
**Key parameters**: 
- Server name includes instance (`STPAMITDT02\SA`)
- Encryption disabled for legacy compatibility
- Credentials embedded (not recommended for production)

## MCP Tool Implementation Pattern
Each tool follows this structure in `CallToolRequestSchema` handler:
1. Extract tool name and arguments: `const { name, arguments: args } = request.params`
2. Validate arguments (future: use zod schemas)
3. Execute database query via: `pool.request().input('paramName', sql.DataType, value).query(sqlString)`
4. Return response: `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`
5. Error handling: Catch exceptions and return: `{ content: [...], isError: true }`

**Example**: `query_database` tool validates `query` starts with "select" (case-insensitive) before execution.

## Database Metadata Queries
Complex metadata retrieval uses **sys catalog and INFORMATION_SCHEMA**:
- `INFORMATION_SCHEMA.TABLES` - list tables/views by schema
- `INFORMATION_SCHEMA.COLUMNS` - column definitions (types, nullability, defaults)
- `INFORMATION_SCHEMA.ROUTINES` - stored procedures/functions
- `sys.foreign_keys` + `sys.foreign_key_columns` - relationship mapping (see `get_table_detailed_metadata`)
- Primary keys queried from `INFORMATION_SCHEMA.TABLE_CONSTRAINTS`

**Note**: Parameterized inputs use `pool.request().input('name', sql.VarChar, value)` to prevent SQL injection.

## Testing & Validation
- [test-connection.js](../test-connection.js) - Tests mssql driver with ODBC connection string (reproduces production setup)
- [simple-test.js](../simple-test.js) - Tests basic mssql driver without ODBC string (reference for troubleshooting)
- [direct-test.js](../direct-test.js) - Tests msnodesqlv8 driver directly (lowest-level driver validation)

**Run compiled server**: `node index.js` (connects via stdio transport for MCP clients)

## TypeScript Strict Mode Settings
- `noUncheckedIndexedAccess: true` - Requires type guards for array/object property access
- `exactOptionalPropertyTypes: true` - Prevents implicit `undefined` assignment
- Source maps enabled for debugging transpiled code

## When Adding New Tools
1. Add tool definition to `ListToolsRequestSchema` handler with `inputSchema` (JSON Schema)
2. Add corresponding handler logic in `CallToolRequestSchema` with input validation
3. Always parameterize SQL inputs to prevent injection
4. Test with appropriate test file before deployment
5. Consider schema validation with zod for complex inputs (framework available but unused)
