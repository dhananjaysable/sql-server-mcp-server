import sql from 'mssql';

async function test() {
    const configs = [
        {
            user: 'mcp_user',
            password: 'mcp@890',
            server: 'localhost',
            database: 'MyAppDb',
            options: { encrypt: true, trustServerCertificate: true }
        },
        {
            user: 'mcp_user',
            password: 'mcp@890',
            server: 'STPAMITDT02',
            database: 'MyAppDb',
            options: { encrypt: true, trustServerCertificate: true }
        }
    ];

    for (const config of configs) {
        console.log(`Testing server: ${config.server}`);
        try {
            await sql.connect(config);
            console.log(`SUCCESS connected to ${config.server}`);
            await sql.close();
        } catch (err) {
            console.log(`FAILED ${config.server}: ${err.message}`);
        }
    }
}

test();
