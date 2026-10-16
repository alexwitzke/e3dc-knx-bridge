const ModbusRTU = require("modbus-serial");
const knx = require("knx");
const http = require("http");

const E3DC_IP = "10.1.1.1";
const PORT = 502;
const SLAVE_ID = 1;
const KNX_IP_GATEWAY = "10.10.0.2";

const modbusClient = new ModbusRTU();

// Aktuelle Messwerte zwischenspeichern
let latestData = {
    produktionIntern: 0,
    extPv: 0,
    produktionGesamt: 0,
    hausverbrauch: 0,
    netzWert: 0,
    netzLabel: "Netzbezug",
    soc: 0,
    autarkie: 0
};

// 1. HTTP-Server mit dynamischem Netz-Label
const server = http.createServer((req, res) => {
    if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
            <!DOCTYPE html>
            <html lang="de">
            <head>
                <meta charset="UTF-8">
                <title>E3/DC Energiefluss Dashboard</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { 
                        font-family: Arial, sans-serif; 
                        background: #0f172a; 
                        color: #e2e8f0; 
                        width: 100vw; 
                        height: 100vh; 
                        overflow: hidden; 
                        display: flex; 
                        flex-direction: column; 
                        justify-content: center; 
                        align-items: center; 
                        padding: 10px; 
                    }
                    
                    .dashboard-container {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        width: 100%;
                        max-width: 950px;
                        gap: 15px;
                    }
                    
                    .column {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                        flex: 1;
                    }
                    
                    .center-column {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        flex: 1.1;
                    }
                    
                    .card {
                        background: #1e293b;
                        border: 2px solid #334155;
                        border-radius: 8px;
                        padding: 8px 12px;
                        text-align: center;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                    }
                    
                    .circle-card {
                        width: 150px;
                        height: 150px;
                        border-radius: 50%;
                        background: #064e3b;
                        border: 4px solid #059669;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        box-shadow: 0 0 20px rgba(5,150,105,0.4);
                    }
                    
                    .label { font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 2px; }
                    .value { font-size: 1.1rem; font-weight: bold; font-family: monospace; }
                    
                    .pv-color { color: #facc15; }
                    .ext-color { color: #38bdf8; }
                    .battery-color { color: #4ade80; }
                    .grid-color { color: #c084fc; }
                    .house-color { color: #fb7185; }
                    .wallbox-color { color: #34d399; }
                    
                    .autarky-val { font-size: 1.7rem; font-weight: bold; color: #fff; }
                    .autarky-sub { font-size: 0.75rem; color: #a7f3d0; }
                    
                    .footer { font-size: 0.65rem; color: #64748b; margin-top: 12px; }
                </style>
            </head>
            <body>
                <div class="dashboard-container">
                    
                    <!-- 1. LINKE SPALTE: Quellen -->
                    <div class="column">
                        <div class="card">
                            <div class="label">PV (Intern)</div>
                            <div class="value pv-color">${latestData.produktionIntern} W</div>
                        </div>
                        <div class="card">
                            <div class="label">Zusatz-PV (Ext.)</div>
                            <div class="value ext-color">${latestData.extPv} W</div>
                        </div>
                        <div class="card">
                            <div class="label">Batterie (SOC)</div>
                            <div class="value battery-color">${latestData.soc} %</div>
                        </div>
                        <div class="card">
                            <div class="label">${latestData.netzLabel}</div>
                            <div class="value grid-color">${Math.abs(latestData.netzWert)} W</div>
                        </div>
                    </div>

                    <!-- 2. MITTLERE SPALTE: Der Kreis (Autarkie) -->
                    <div class="center-column">
                        <div class="circle-card">
                            <div class="autarky-val">${latestData.autarkie} %</div>
                            <div class="autarky-sub">Autarkie</div>
                        </div>
                    </div>

                    <!-- 3. RECHTE SPALTE: Verbraucher -->
                    <div class="column">
                        <div class="card" style="padding: 21px 12px;">
                            <div class="label">Hausverbrauch</div>
                            <div class="value house-color">${latestData.hausverbrauch} W</div>
                        </div>
                        <div class="card" style="padding: 21px 12px;">
                            <div class="label">Easy Connect (Wallbox)</div>
                            <div class="value wallbox-color">0 W</div>
                        </div>
                    </div>

                </div>
            </body>
            </html>
        `);
    } else {
        res.writeHead(404);
        res.end("Not found");
    }
});

server.listen(3000, () => {
    console.log("Webserver läuft auf http://localhost:3000");
});

const knxConnection = knx.Connection({
    ipAddr: KNX_IP_GATEWAY,
    ipPort: 3671,
    handlers: {
        connected: function() {
            console.log("✓ Verbunden mit dem KNX-Bus!");
            startPolling();
        },
        error: function(connstatus) {
            console.error("KNX-Verbindungsfehler: ", connstatus);
        }
    }
});

async function pollE3DC() {
    try {
        if (!modbusClient.isOpen) {
            await modbusClient.connectTCP(E3DC_IP, { port: PORT });
            modbusClient.setID(SLAVE_ID);
        }

        var leistungData = await modbusClient.readHoldingRegisters(40067, 2);
        const produktionIntern = leistungData.data[0] + leistungData.data[1] * 65536;

        var zusaetzlicheEinspeisungData = await modbusClient.readHoldingRegisters(40075, 2);
        let extPvRaw = zusaetzlicheEinspeisungData.data[0] + (zusaetzlicheEinspeisungData.data[1] * 65536);
        if (extPvRaw > 2147483647) extPvRaw -= 4294967296;
        const extPv = Math.abs(extPvRaw);

        const produktionGesamt = produktionIntern + extPv;

        var hausverbrauchData = await modbusClient.readHoldingRegisters(40071, 2);
        const hausverbrauch = hausverbrauchData.data[0] + hausverbrauchData.data[1] * 65536;

        var leistungAmNetzuebergabepunktData = await modbusClient.readHoldingRegisters(40073, 2);
        const leistungAmNetzuebergabepunkt = leistungAmNetzuebergabepunktData.data[0];
        let netzLeistung = leistungAmNetzuebergabepunkt;
        if (leistungAmNetzuebergabepunkt > 32768) {
            netzLeistung = leistungAmNetzuebergabepunkt - 65536;
        }

        var socData = await modbusClient.readHoldingRegisters(40082, 1);
        const soc = socData.data[0];

        // Autarkie exakt berechnen (gedeckelter Wert zwischen 0% und 100%)
        let autarkie = 100;
        if (hausverbrauch > 0) {
            const gridImport = Math.max(0, netzLeistung);
            const selfSupplied = Math.max(0, hausverbrauch - gridImport);
            autarkie = Math.min(100, Math.round((selfSupplied / hausverbrauch) * 100));
        }

        // Dynamische Netzbeschriftung (Negativ = Einspeisung, Positiv = Bezug)
        const netzLabel = netzLeistung < 0 ? "Netzeinspeisung" : "Netzbezug";

        // An KNX senden
        knxConnection.write("1/3/150", produktionGesamt, "8.001");
        knxConnection.write("1/3/151", soc, "5.001");
        knxConnection.write("1/3/152", hausverbrauch, "8.001");
        knxConnection.write("1/3/154", netzLeistung, "8.001");

        // Werte für das direkte Rendern aktualisieren
        latestData = {
            produktionIntern: produktionIntern,
            extPv: extPv,
            produktionGesamt: produktionGesamt,
            hausverbrauch: hausverbrauch,
            netzWert: netzLeistung,
            netzLabel: netzLabel,
            soc: soc,
            autarkie: autarkie
        };

    } catch (err) {
        console.error(`Fehler bei Abfrage:`, err.message);
        try { await modbusClient.close(); } catch (e) {}
    }
}

function startPolling() {
    setInterval(pollE3DC, 10000);
    pollE3DC();
}