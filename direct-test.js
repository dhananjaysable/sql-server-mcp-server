import sql from 'msnodesqlv8';

const connString = "Driver={ODBC Driver 17 for SQL Server};Server=STPAMITDT02\\SA;Database=MyAppDb;Uid=mcp_user;Pwd=mcp@890;Trusted_Connection=no;Encrypt=no;";

console.log("Testing direct msnodesqlv8 connection...");
console.log("String:", connString);

sql.open(connString, (err, conn) => {
    if (err) {
        console.error("FAILED match:", err);
        return;
    }
    console.log("SUCCESS: Connected!");
    conn.query("SELECT @@VERSION as version", (err, rows) => {
        if (err) console.error("Query failed:", err);
        else console.log("Version:", rows[0].version);
        conn.close();
    });
});
