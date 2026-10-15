const ModbusRTU = require("modbus-serial");
const knx = require("knx");

// --- Konfiguration ---
const E3DC_IP = "10.1.1.1";
const PORT = 502;
const SLAVE_ID = 1;

const KNX_IP_GATEWAY = "10.10.0.2"; // IP-Adresse deines KNX/IP-Routers

const modbusClient = new ModbusRTU();

// KNX Verbindung initialisieren
const knxConnection = knx.Connection({
    ipAddr: KNX_IP_GATEWAY,
    ipPort: 3671,
    handlers: {
        connected: function () {
            console.log("✓ Verbunden mit dem KNX-Bus!");
            startPolling();
        },
        error: function (connstatus) {
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

        //         // 1. PV-Leistung (Reg 40067, 2 Register)
        // var leistungData = await modbusClient.readHoldingRegisters(40067, 2);
        // const leistung = leistungData.data[0] + leistungData.data[1] * 65536;

        var leistungData = await modbusClient.readHoldingRegisters(40067, 2);
        const leistung = leistungData.data[0] + leistungData.data[1] * 65536;

        // 2. Zusätzliche Einspeisung / Erzeuger (Reg 40075, 2 Register)
        var zusaetzlicheEinspeisungData = await modbusClient.readHoldingRegisters(40075, 2);
        //TODO: const zusaetzlicheEinspeisung = 65535 - zusaetzlicheEinspeisungData.data[0]; //wenn dunkel und produktion 0, dann passt das nicht, es werden immer 65535 ausgegeben
        //TODO: geht das so?
        const zusaetzlicheEinspeisung = zusaetzlicheEinspeisungData.data[1] * 65535 + zusaetzlicheEinspeisungData.data[0]; //wenn dunkel und produktion 0, dann passt das nicht, es werden immer 65535 ausgegeben

        const produktionGesamt = leistung + zusaetzlicheEinspeisung;

        // // 2. Zusätzliche Einspeisung / Erzeuger (Reg 40075, 2 Register)
        // var zusaetzlicheEinspeisungData = await modbusClient.readHoldingRegisters(40075, 2);
        // const zusaetzlicheEinspeisung = zusaetzlicheEinspeisungData.data[0] + zusaetzlicheEinspeisungData.data[1] * 65536;

        // const produktionGesamt = leistung + zusaetzlicheEinspeisung;

        // 3. Hausverbrauch (Reg 40071, 2 Register)
        var hausverbrauchData = await modbusClient.readHoldingRegisters(40071, 2);
        const hausverbrauch = hausverbrauchData.data[0] + hausverbrauchData.data[1] * 65536;

        // 4. Netzübergabepunkt (Reg 40073, 2 Register)
        var leistungAmNetzuebergabepunktData = await modbusClient.readHoldingRegisters(40073, 2);
        const leistungAmNetzuebergabepunkt = leistungAmNetzuebergabepunktData.data[0];

        let einspeisung = 0;
        let netzLeistung = leistungAmNetzuebergabepunkt;
        if (leistungAmNetzuebergabepunkt > 32768) {
            einspeisung = leistungAmNetzuebergabepunkt - 65536; // Negative Werte = Netzeinspeisung
            netzLeistung = einspeisung;
        }

        // 5. Batterie SOC (Reg 40082, 1 Register)
        var socData = await modbusClient.readHoldingRegisters(40082, 1);
        const soc = socData.data[0];

        console.log(`[${new Date().toLocaleTimeString()}] E3/DC -> Prod: ${produktionGesamt}W | Haus: ${hausverbrauch}W | Netz: ${netzLeistung}W | SOC: ${soc}%`);

        /* 
        GAs:
        1/3/150: E3DC Produktion Gesamt in Watt (DPT 9.001)
        1/3/151: E3DC Akkustand (SOC) in Prozent (DPT 5.001)
        1/3/152: Hausverbrauch in Watt (DPT 9.001)       
        */
        knxConnection.write("1/3/150", produktionGesamt, "7.001");
        knxConnection.write("1/3/151", soc, "5.001");
        knxConnection.write("1/3/152", hausverbrauch, "7.001");

        // Optional: Netzübergabepunkt auf zusätzlicher GA (z.B. 1/3/154)
        knxConnection.write("1/3/154", netzLeistung, "8.001");

    } catch (err) {
        console.error(`[${new Date().toLocaleTimeString()}] Fehler bei Abfrage:`, err.message);
        try {
            await modbusClient.close();
        } catch (e) { }
    }
}

function startPolling() {
    console.log("Starte zyklische Abfrage (10 Sekunden Intervall)...");
    pollE3DC();
    setInterval(pollE3DC, 10000);
}