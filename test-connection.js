import sql from 'mssql/msnodesqlv8.js';

const config = {
    // Proven connection string for Named Pipes with SQL Auth
    connectionString: "Driver={ODBC Driver 17 for SQL Server};Server=STPAMITDT02\\SA;Database=MyAppDb;Uid=mcp_user;Pwd=mcp@890;Trusted_Connection=no;Encrypt=no;"
};

async function test() {
    console.log(`Testing mssql wrapper with string...`);
    try {
        let pool = await sql.connect(config);
        console.log(`SUCCESS: Connected!`);
        let result = await pool.request().query('SELECT TOP 5 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES');
        console.log('Tables found:');
        console.table(result.recordset);
        await pool.close();
    } catch (err) {
        console.error(`FAILED: ${err.message}`);
    }
}

test();
