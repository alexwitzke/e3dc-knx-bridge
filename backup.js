// const ModbusRTU = require("modbus-serial");
// const knx = require("knx");

// // --- Konfiguration E3/DC ---
// const E3DC_IP = "10.1.1.1";
// const MODBUS_PORT = 502;
// const SLAVE_ID = 1;
// const DOC_REGISTER_SOC = 40083; 
// const REGISTER_ADDRESS = DOC_REGISTER_SOC - 1; // 40082 (mit -1 Offset)

// // --- Konfiguration KNX ---
// const KNX_IP_GATEWAY = "10.10.0.2"; // IP-Adresse deines KNX/IP-Routers oder Tunnels anpassen!
// const GROUP_ADDRESS = "1/3/151";      // Deine Gruppenadresse für den Akkustand (DPT 5.001 / Prozent)

// // Modbus Client initialisieren
// const modbusClient = new ModbusRTU();

// // KNX Verbindung initialisieren
// const knxConnection = knx.Connection({
//     ipAddr: KNX_IP_GATEWAY,
//     ipPort: 3671,
//     handlers: {
//         connected: function() {
//             console.log("✓ Verbunden mit dem KNX-Bus!");
//             startPolling();
//         },
//         error: function(connstatus) {
//             console.error("KNX-Verbindungsfehler: ", connstatus);
//         }
//     }
// });

// async function startPolling() {
//     try {
//         await modbusClient.connectTCP(E3DC_IP, { port: MODBUS_PORT });
//         modbusClient.setID(SLAVE_ID);
//         console.log("✓ Verbunden mit E3/DC Modbus TCP!\n");

//         // Einmal pro Intervall auslesen und senden
//         setInterval(async () => {
//             try {
//                 // Batterie-SOC lesen (1 Register, Uint16)
//                 const data = await modbusClient.readHoldingRegisters(REGISTER_ADDRESS, 1);
//                 const soc = data.data[0];

//                 console.log(`[${new Date().toLocaleTimeString()}] E3/DC Akkustand: ${soc}% -> Sende an KNX GA ${GROUP_ADDRESS}`);

//                 // Wert auf den KNX-Bus schreiben (Datentyp 5.001 für Prozent 0-100%)
//                 knxConnection.write(GROUP_ADDRESS, soc, "5.001");

//             } catch (err) {
//                 console.error("Fehler beim Auslesen/Senden:", err.message);
//             }
//         }, 10000); // Alle 10 Sekunden

//     } catch (err) {
//         console.error("Konnte keine Verbindung zum E3/DC aufbauen:", err.message);
//     }
// }

// create an empty modbus client
var ModbusRTU = require("modbus-serial");
var client = new ModbusRTU();

// open connection to a udp line
client.connectTCP("10.1.1.1", { port: 502 });
client.setID(1);

// read the values of 10 registers starting at address 0
// on device number 1. and log the values to the console.
setInterval(async () => {
    try {
        var hausverbrauchData = await client.readHoldingRegisters(40071, 2);
        const hausverbrauch = hausverbrauchData.data[0] + hausverbrauchData.data[1] * 65536;

        var leistungData = await client.readHoldingRegisters(40067, 2);
        const leistung = leistungData.data[0] + leistungData.data[1] * 65536;

        var zusaetzlicheEinspeisungData = await client.readHoldingRegisters(40075, 2);
        const zusaetzlicheEinspeisung = 65535 - zusaetzlicheEinspeisungData.data[0];

        const produktionGesamt = leistung + zusaetzlicheEinspeisung;

        var leistungAmNetzuebergabepunktData = await client.readHoldingRegisters(40073, 2);
        const leistungAmNetzuebergabepunkt = leistungAmNetzuebergabepunktData.data[0]; //werte über 32768 sind einspeisung, daher 65535 - wert

        var einspeisung = 0;
        if (leistungAmNetzuebergabepunkt > 32768) {
            einspeisung= 65536 - leistungAmNetzuebergabepunkt;
        } 

        /*
        
        GAs:
        1/3/151: E3DC Produktion Gesamt in Watt (16 Bit, DPT 9.001)
        1/3/152: E3DC Akkustand (SOC) in Prozent (DPT 5.001)
        1/3/153: Hausverbrauch in Watt (16 Bit, DPT 9.001)


        
        */

        console.log(`[${new Date().toLocaleTimeString()}] Hausverbrauch: ${hausverbrauch} W`);
        //console.log(`[${new Date().toLocaleTimeString()}] PV-Leistung: ${leistung} W`);
        //console.log(`[${new Date().toLocaleTimeString()}] Zusaetzliche PV-Leistung: ${zusaetzlicheEinspeisung} W`);
        console.log(`[${new Date().toLocaleTimeString()}] Produktion Gesamt: ${produktionGesamt} W`);
        //console.log(`[${new Date().toLocaleTimeString()}] Leistung am Netzuebergabepunkt: ${leistungAmNetzuebergabepunkt - 65536} W`); //negative Werte sind Einspeisung, positive Werte sind Ausspeisung
        //console.log(`[${new Date().toLocaleTimeString()}] Übergabepunkt: ${leistungAmNetzuebergabepunkt} W \t Einspeisung: ${einspeisung} W`);

        // // Batterie-SOC lesen (1 Register, Uint16)
        // const data = await modbusClient.readHoldingRegisters(REGISTER_ADDRESS, 1);
        // const soc = data.data[0];

        // console.log(`[${new Date().toLocaleTimeString()}] E3/DC Akkustand: ${soc}% -> Sende an KNX GA ${GROUP_ADDRESS}`);

        // // Wert auf den KNX-Bus schreiben (Datentyp 5.001 für Prozent 0-100%)
        // knxConnection.write(GROUP_ADDRESS, soc, "5.001");

    } catch (err) {
        console.error("Fehler beim Auslesen/Senden:", err.message);
    }
}, 10000); // Alle 10 Sekunden
