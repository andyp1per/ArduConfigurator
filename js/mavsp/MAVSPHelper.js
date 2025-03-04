/*global $, SERVO_DATA, PID_names, ADJUSTMENT_RANGES, RXFAIL_CONFIG, SERVO_CONFIG*/
//'use strict';

//const { fstat } = require("fs");

//var {mavlink20, MAVLink20Processor} = require("./mav_v2.js"); 

// global, just cause
SYSID = undefined;
COMPID = undefined;


function isFunction(variableToCheck){
    //If our variable is an instance of "Function"
    if (variableToCheck instanceof Function) {
        return true;
    }
    return false;
}

// create the output hooks for the parser/s
// we overwrite the default send() instead of overwriting write() or using setConnection(), which don't know the ip or port info.
// and we accept ip/port either as part of the mavmsg object, or as a sysid in the OPTIONAL 2nd parameter
generic_link_sender = function(mavmsg,sysid) {
    //console.log("generic sender queuing:"+mavmsg._name);
    // this is really just part of the original send()
    // paranoia helps.. very rarely, i get 'pack' is not a functon, so check for it first
    
    if(! isFunction(mavmsg.pack)){ 
        debugger;
    }
    var buf = mavmsg.pack(this);  //Buffer

    var abuf = toArrayBuffer(buf); // ArrayBuffer

    //this.write( buf ); // already open, we hope

    var message = new MspMessageClass();
        message.code = mavmsg._id;//code
        message.name = mavmsg._name;
        message.messageBody = abuf;
        message.onSend  = function (sendInfo) {  

            if ( mavmsg._name != "HEARTBEAT") {
                //console.log("msg sent! "+message.name); brief
                console.log("sending-->");/*console.log(message);*/console.log(mavmsg);  //verbose
            }

            // after a successful send, stop the timeout counter 
            MSP.removeCallback(message.code);
            //clearTimeout(this.timer);

           }
        message.onFinish  = function (sendInfo) {  
            publicScope.freeSoftLock(); 
           }

       // message.onSend  = null;//callback_sent;
        /* In case of MSP_REBOOT special procedure is required
         */
        //if (code == MSPCodes.MSP_SET_REBOOT || code == MSPCodes.MSP_EEPROM_WRITE) {
        //    message.retryCounter = 10;
       // }



    helper.mspQueue.put(message);


    // this is really just part of the original send()
    this.seq = (this.seq + 1) % 256;
    this.total_packets_sent +=1;
    this.total_bytes_sent += buf.length;
}

var logger  = null;

MAVLink20Processor.prototype.send = generic_link_sender; // tell library how to send

var mavParserObj = new MAVLink20Processor(logger, 255,190); // 255 is the mavlink sysid of this code as a GCS, as per mavproxy.
var mpo = mavParserObj; // alternative name

//----------------------------------------------------------------------------------------------------

// todo buzz add more global mavlink setup stuff here that needs an instance of mavParserObj already done.
// tab-specific things can also go in the relevant tabs/xxx.js

//-----------------------------

// this is support for multiple vehicles each in their own mode, but for now just use one.
var mavFlightModes = [];
var sysids = {}; // collecton if ID's we've seen
mavFlightModes.push(new MavFlightMode(mavlink20, mavParserObj, null, null,SYSID));
sysids[SYSID] = true;

// global mav mission object for gettting/sending missions to drone
var MissionObj = undefined ; // we delay instantion till we know SYSID // new MavMission(SYSID,COMPID,mavlink20, mavParserObj , null, logger);

async function send_canned_mission_to_drone() {
    // obj for missions
    if (MissionObj ==undefined )  MissionObj = new MavMission(SYSID,COMPID,mavlink20, mavParserObj , null, logger);

    var module = { exports: {} }; // hack for node compat
    var readfilename = "/gotmission1.js"; // no leading . or ./  its an absolute url ah-la http://xxxx/gotmission1.js

    //mod = await import(readfilename);
    // 'miss' is in a javascript list-of-lists (mission-of-waypoints) format as used by mavMission.js
    //var miss = window.missionItems;

    // now we'll build something in a equivalent suitable format from the GUI data:
    var miss = [];

    //////////////////////////////////////////////
    //var waypointId = 0;
    //var wp = MISSION_PLANER.extractBuffer(waypointId);

        var gui_miss = MISSION_PLANER.get();
        var gui_miss_len = MISSION_PLANER.get().length;

        for ( e of gui_miss) { // e stands for 'element' . Yes an 'of' loop!

            var act = e.getAction(); // eg == MWNP.WPTYPE.SET_HEAD or == MWNP.WPTYPE.JUMP
            var seq = e.getNumber();
            var p1 = e.getP1();
            var p2 = e.getP3();
            var p3 = e.getP3();
            var p4 = 0;// e.getP4(); buzz toto get a P4()

            var attachment = e.isAttached(); //nfi
            var xlat = e.getLatMap(); //its badically just getLat /10000000
            var xlon = e.getLonMap(); // 
            var xalt = e.getAlt(); // 

            // element.setP1(123);
            // element.setP2(123);
            // element.setP3(123);
            // element.setAction(zzz);
            var autocontinue = 1; 

            //if terrain_alt:
            //frame = mavlink20.MAV_FRAME_GLOBAL_TERRAIN_ALT
            //else:
            var frame = mavlink20.MAV_FRAME_GLOBAL_RELATIVE_ALT

            var tmp = [
                seq,//e.seq, // 0
			    0,//e.current,  //1
			    frame,//e.frame,  //2
			    act,//e.command, //3
			    p1,//e.param1, //4
			    p2,//e.param2, //5
			    p3,//e.param3, //6
			    p4,//e.param4, //7
			    xlat,//e.x,///10000000,    //8
			    xlon,//e.y,///10000000,    //9
			    xalt,//e.z,  //10
			    autocontinue]; 

            miss.push(tmp);
        }
        
    //////////////////////////////////
    console.log('START SEND MISSION to drone:',readfilename);
    // awaiting in a non-async is like this...
    MissionObj.MissionToDrone(miss).then(results => { console.log('END SEND MISSION to drone');  });
}

async function get_mission_from_drone(cb) {
    // obj for missions
    if (MissionObj ==undefined )  MissionObj = new MavMission(SYSID,COMPID,mavlink20, mavParserObj , null, logger);

    var writefilename = "./gotmission1.js"; // default if not specificed
   
    console.log('START READ MISSION from drone',writefilename)
    // awaiting in a non-async is like this...
    await MissionObj.DroneToMission(writefilename).then(results => { 
        // mavMission.js does a  MISSION_PLANER.put(new Waypoint( ... )) for each of things it gets from the vehicle before we get here.
        console.log('END READ MISSION from drone');  
        console.log(MISSION_PLANER); 
        if ( cb ) cb();
    });

    
}

function mavFlightModes_rehook() { 

    // re-hook all the MavFlightMode objects to their respective events, since we just added a new one.
    mavFlightModes.forEach(  function(m) {
        m.removeAllListeners('modechange');
        m.removeAllListeners('armingchange');
        //console.log("change hook mavFlightModes.length"+mavFlightModes.length);

        // these events are generated locally by mavFlightMode.js, and it passes 'state.xxx as params
        m.on('modechange', function(state) {
            console.log(`\n--Got a MODE-CHANGE message `);
            console.log(`... with armed-state: ${state.armed} and sysid: ${state.sysid} and mode: ${state.mode}`);

            var armstr = state.armed==true?"ARMED":"DISARMED";
            $(".mode_arming_info").text("Mode:"+state.mode+" "+armstr);

        });
        m.on('armingchange', function(state) {
            console.log(`\n--Got a ARMING-CHANGE message `);
            console.log(`... with armed-state: ${state.armed} and sysid: ${state.sysid} and mode: ${state.mode}`);
            var armstr = state.armed==true?"ARMED":"DISARMED";
            var modestr = state.mode===undefined?"not-yet-known":state.mode;
            $(".mode_arming_info").text("Mode:"+modestr+" "+armstr);
            if ( state.armed==true ) {
                $(".mode_arming_info").css("color","red");
            } else {
                $(".mode_arming_info").css("color","green");
            }
        });

    });

}

mavFlightModes_rehook(); // first call here has no sysid, so its kinda irrelevant..

//-----------------------------

var ParamsObj = new MavParam(SYSID,COMPID,mavParserObj,null);


//-----------------------------


//-----------------------------

var testing = 0;

//----------------------------------------------------------------------------------------------------
var mspHelper = (function (gui) {
    var self = {};

    self.BAUD_RATES_post1_6_3 = [
        'AUTO',
        '1200',
        '2400',
        '4800',
        '9600',
        '19200',
        '38400',
        '57600',
        '115200',
        '230400',
        '250000',
        '460800',
        '921600'
    ];

    self.SERIAL_PORT_FUNCTIONS = {
        'MSP': 0,
        'GPS': 1,
        'TELEMETRY_FRSKY': 2,
        'TELEMETRY_HOTT': 3,
        'TELEMETRY_LTM': 4, // LTM replaced MSP
        'TELEMETRY_SMARTPORT': 5,
        'RX_SERIAL': 6,
        'BLACKBOX': 7,
        'TELEMETRY_MAVLINK': 8,
        'TELEMETRY_IBUS': 9,
        'RUNCAM_DEVICE_CONTROL': 10,
        'TBS_SMARTAUDIO': 11,
        'IRC_TRAMP': 12,
        'OPFLOW': 14,
        'LOG': 15,
        'RANGEFINDER': 16,
        'VTX_FFPV': 17,
        'ESC': 18,
        'GSM_SMS': 19,
        'FRSKY_OSD': 20,
        'DJI_FPV': 21,
        'SMARTPORT_MASTER': 23,
        'IMU2': 24,
    };

    // Required for MSP_DEBUGMSG because console.log() doesn't allow omitting
    // the newline at the end, so we keep the pending message here until we find a
    // '\0', then print it. Messages sent by MSP_DEBUGMSG are guaranteed to
    // always finish with a '\0'.
    var debugMsgBuffer = '';

    // mav version of processData - INCOMING packets thru here...
    self.processDataMav = function (mavmsg) {

        //var data = new DataView(mavmsg._msgbuf, 0);

        // for all packets we want to record the most recent...
        var store = {};

        if (mavmsg._id == -1 ) return; //mavlink20.messages.bad_data

        
        mavmsg.fieldnames.forEach(function(field) {
            //console.log(field);
            store[field] = mavmsg[field]; // store is a cut-down list of just data attrs, not header, raw msg bufs , sysid etc
        });
        FC.curr_mav_state[mavmsg._name] = store;  // or could have used mavmsg for a more verbose store
        // this means that FC.curr_mav_state['HEARTBEAT'] is an minimal object with all the latest data in it., etc

        //console.log(mavmsg._name);

        // packet-specific stuff
        switch (mavmsg._id ) {

            case mavlink20.MAVLINK_MSG_ID_HEARTBEAT:
                /* ["type", "autopilot", "base_mode", "custom_mode", "system_status", "mavlink_version"]
                autopilot: 3
                base_mode: 81
                custom_mode: 0
                mavlink_version: 3
                system_status: 3
                type: 2
                */

                // buzz todo
                break;
                case mavlink20.MAVLINK_MSG_ID_AUTOPILOT_VERSION:
                    // borrowed from here https://github.com/ArduPilot/APWeb
                    var flight_sw_version = mavmsg.flight_sw_version;
                    var major_version = flight_sw_version >> 24;
                    var min_version = (flight_sw_version >> 16) & 0xFF;
                    var patch_version = (flight_sw_version >> 8) & 0xFF;
                    var version_type = flight_sw_version & 0xFF;
                    if (version_type >= 255) {
                        version_type = '';
                    } else if (version_type >= 192) {
                        version_type = 'RC' + (version_type-191);
                    } else if (version_type >= 128) {
                        version_type = 'beta' + (version_type-127);
                    } else if (version_type >= 64) {
                        version_type = 'alpha' + (version_type-63);
                    } else {
                        version_type = 'dev';
                    }

                    var ver_string = major_version + "." + min_version + "." + patch_version + "-" + version_type;

                   CONFIG.flightControllerVersion = ver_string + " (" + mavmsg.flight_custom_version + ") " ;
                   break;
            case mavlink20.MAVLINK_MSG_ID_TIMESYNC:
                /*  ["tc1", "ts1"]
                tc1: (3) [0, 0, false]
                ts1: (3) [3709043417, 1904, false]
                */

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_HWSTATUS:
                /* ["Vcc", "I2Cerr"]
                I2Cerr: 0
                Vcc: 5122
                */
                CONFIG.i2cError = mavmsg.I2Cerr;
                ANALOG.board_vcc = mavmsg.Vcc / 1000.0;  // cpu volts
                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_MOUNT_STATUS:
                /* ["target_system", "target_component", "pointing_a", "pointing_b", "pointing_c"]
                pointing_a: 0
                pointing_b: 0
                pointing_c: 0
                target_component: 0
                target_system: 0
                */
                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_AHRS:
                /* ["omegaIx", "omegaIy", "omegaIz", "accel_weight", "renorm_val", "error_rp", "error_yaw"]
                accel_weight: 0
                error_rp: 0.0010149696609005332
                error_yaw: 0.004215225577354431
                omegaIx: -0.00036707011167891324
                omegaIy: -0.004113930743187666
                omegaIz: 0.0005907636950723827
                renorm_val: 0
                */
                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_AHRS2:
                /* ["roll", "pitch", "yaw", "altitude", "lat", "lng"]
                altitude: 0
                lat: 0
                lng: 0
                pitch: -0.03380150720477104
                roll: 0.0497613400220871
                yaw: 3.117163896560669
                */
                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_AHRS3:
                /* ["roll", "pitch", "yaw", "altitude", "lat", "lng", "v1", "v2", "v3", "v4"]
                altitude: 0
                lat: 0
                lng: 0
                pitch: -0.031533993780612946
                roll: 0.05390428751707077
                v1: 0
                v2: 0
                v3: 0
                v4: 0
                yaw: 3.1175403594970703
                */
                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_EKF_STATUS_REPORT:
                /* ["flags", "velocity_variance", "pos_horiz_variance", "pos_vert_variance", "compass_variance", "terrain_alt_variance", "airspeed_variance"]
                airspeed_variance: 0
                compass_variance: 0.005909742787480354
                flags: 421
                pos_horiz_variance: 0.003528701141476631
                pos_vert_variance: 0.005041991826146841
                terrain_alt_variance: 0
                velocity_variance: 0
                */
                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_VIBRATION:
                /* ["time_usec", "vibration_x", "vibration_y", "vibration_z", "clipping_0", "clipping_1", "clipping_2"]
                clipping_0: 0
                clipping_1: 0
                clipping_2: 0
                time_usec: (3) [867970223, 1, true]
                vibration_x: 0.025295495986938477
                vibration_y: 0.03136098012328148
                vibration_z: 0.043347425758838654
                */
                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_BATTERY_STATUS:
                /* ["id", "battery_function", "type", "temperature", "voltages", "current_battery", "current_consumed", "energy_consumed", "battery_remaining", "time_remaining", "charge_state", "voltages_ext", "mode", "fault_bitmask"]
                battery_function: 0
                battery_remaining: 74
                charge_state: 0
                current_battery: 59
                current_consumed: 844
                energy_consumed: 15
                fault_bitmask: 0
                id: 0
                mode: 0
                temperature: 32767
                time_remaining: 0
                type: 0
                voltages: (10) [510, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535, 65535]
                voltages_ext: (4) [0, 0, 0, 0]
                */
                ANALOG.battery_full_when_plugged_in = true; // buzz hardcoded hack to match ardu
                ANALOG.cell_count = 4; // buzz
                ANALOG.voltage =  mavmsg.voltages[0] / 1000.0; // showing voltage from first battery only
                ANALOG.amperage = mavmsg.current_battery / 100.0; //?
                ANALOG.mAhdrawn = mavmsg.current_consumed; 
                ANALOG.battery_remaining_capacity = mavmsg.battery_remaining; //one of these is 
                ANALOG.battery_percentage = mavmsg.battery_remaining;         //wrong .buzz
                // todo 'id' not handled for anything other than 'zero'  for first battrery.

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_FENCE_STATUS:
                /* ["breach_status", "breach_count", "breach_type", "breach_time", "breach_mitigation"]
                breach_count: 0
                breach_mitigation: 0
                breach_status: 0
                breach_time: 0
                breach_type: 0
                */

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_SYSTEM_TIME:
                /* ["time_unix_usec", "time_boot_ms"]
                time_boot_ms: 5162930
                time_unix_usec: (3) [0, 0, true]
                */

                // buzz todo
                break;

            case mavlink20.MAVLINK_MSG_ID_GPS_RAW_INT:
                /* ["time_usec", "fix_type", "lat", "lon", "alt", "eph", "epv", "vel", "cog", "satellites_visible", "alt_ellipsoid", "h_acc", "v_acc", "vel_acc", "hdg_acc", "yaw"]
                alt: 0
                alt_ellipsoid: 0
                cog: 0
                eph: 65535
                epv: 65535
                fix_type: 0
                h_acc: 0
                hdg_acc: 0
                lat: 0
                lon: 0
                satellites_visible: 0
                time_usec: (3) [0, 0, true]
                v_acc: 0
                vel: 0
                vel_acc: 0
                yaw: 0
                */
               //https://github.com/mavlink/c_library_v2/blob/master/common/mavlink_msg_gps_raw_int.h
               /*
                int32_t alt; //< [mm] Altitude (MSL). Positive for up. Note that virtually all GPS modules provide the MSL altitude in addition to the WGS84 altitude.//
                int32_t alt_ellipsoid; //< [mm] Altitude (above WGS84, EGM96 ellipsoid). Positive for up.//
                uint32_t h_acc; //< [mm] Position uncertainty.//
                uint32_t v_acc; //< [mm] Altitude uncertainty.//
                uint32_t hdg_acc; //< [degE5] Heading / track uncertainty//
                uint32_t vel_acc; //< [mm] Speed uncertainty.//
                uint16_t yaw; //< [cdeg] Yaw in earth frame from north. Use 0 if this GPS does not provide yaw. Use UINT16_MAX if this GPS is configured to provide yaw and is currently unable to provide it. Use 36000 for north./
                @param time_usec [us] Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number.
                * @param fix_type  GPS fix type.
                * @param lat [degE7] Latitude (WGS84, EGM96 ellipsoid)
                * @param lon [degE7] Longitude (WGS84, EGM96 ellipsoid)
                * @param alt [mm] Altitude (MSL). Positive for up. Note that virtually all GPS modules provide the MSL altitude in addition to the WGS84 altitude.
                * @param eph  GPS HDOP horizontal dilution of position (unitless * 100). If unknown, set to: UINT16_MAX
      //unused: * @param epv  GPS VDOP vertical dilution of position (unitless * 100). If unknown, set to: UINT16_MAX
                * @param vel [cm/s] GPS ground speed. If unknown, set to: UINT16_MAX
                * @param cog [cdeg] Course over ground (NOT heading, but direction of movement) in degrees * 100, 0.0..359.99 degrees. If unknown, set to: UINT16_MAX
                * @param satellites_visible  Number of satellites visible. If unknown, set to UINT8_MAX
                * */

                GPS_DATA.fix = mavmsg.fix_type ; // data.getUint8(0);  MSPCodes.MSP_RAW_GPS:
                GPS_DATA.numSat = mavmsg.satellites_visible ;// data.getUint8(1);MSPCodes.MSP_RAW_GPS:
                GPS_DATA.lat = mavmsg.lat ;// data.getInt32(2, true);MSPCodes.MSP_RAW_GPS:
                GPS_DATA.lon =  mavmsg.lon ;// data.getInt32(6, true);MSPCodes.MSP_RAW_GPS:
                GPS_DATA.alt =  mavmsg.alt /1000.0;  //ASL, AboveSeaLevel = MSL. //data.getInt16(10, true);MSPCodes.MSP_RAW_GPS:
                GPS_DATA.speed = mavmsg.vel /100.0;//data.getUint16(12, true);MSPCodes.MSP_RAW_GPS:
                GPS_DATA.ground_course = mavmsg.cog ;//data.getUint16(14, true);MSPCodes.MSP_RAW_GPS:
                GPS_DATA.hdop = mavmsg.eph ;//data.getUint16(16, true);MSPCodes.MSP_RAW_GPS:
                GPS_DATA.eph = mavmsg.h_acc /10.0; //eph and HDOP are basically same thing but different units. here we convert 'mm' to match scale in MP 'Status' screen for gcs display 
                GPS_DATA.epv = mavmsg.v_acc /10.0; // buzz todo, in the GUI we claim these two are 'm' meters, but i scaled it as mm->cm ?

                // todo none of the _acc gps acceleeration values r used?
                // vdop is unued

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_SCALED_PRESSURE:
                /* ["time_boot_ms", "press_abs", "press_diff", "temperature", "temperature_press_diff"]
                press_abs: 1024.4854736328125
                press_diff: 0
                temperature: 5131
                temperature_press_diff: 0
                time_boot_ms: 5162927
                */

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_SCALED_IMU2:
                /* ["time_boot_ms", "xacc", "yacc", "zacc", "xgyro", "ygyro", "zgyro", "xmag", "ymag", "zmag", "temperature"]
                temperature: 0
                time_boot_ms: 5162927
                xacc: -37
                xgyro: -2
                xmag: 0
                yacc: -27
                ygyro: 10
                ymag: 0
                zacc: -896
                zgyro: 4
                zmag: 0
                */

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_RAW_IMU:
                /*["time_usec", "xacc", "yacc", "zacc", "xgyro", "ygyro", "zgyro", "xmag", "ymag", "zmag", "id", "temperature"]
                id: 0
                temperature: 5011
                time_usec: (3) [867960200, 1, true]
                xacc: 3
                xgyro: 0
                xmag: -382
                yacc: -61
                ygyro: 5
                ymag: -27
                zacc: -1058
                zgyro: 0
                zmag: -337
                */
                // improperly scaled
                SENSOR_DATA.accelerometer[0] = mavmsg.xacc / 512; // the 512 scaling is from MSPCodes.MSP_RAW_IMU
                SENSOR_DATA.accelerometer[1] = mavmsg.yacc / 512; // MSPCodes.MSP_RAW_IMU
                SENSOR_DATA.accelerometer[2] = mavmsg.zacc / 512; // MSPCodes.MSP_RAW_IMU

                 // properly scaled?
                 SENSOR_DATA.gyroscope[0] = mavmsg.xgyro * (4 / 16.4);// MSPCodes.MSP_RAW_IMU
                 SENSOR_DATA.gyroscope[1] = mavmsg.ygyro * (4 / 16.4);// MSPCodes.MSP_RAW_IMU
                 SENSOR_DATA.gyroscope[2] = mavmsg.zgyro * (4 / 16.4);// MSPCodes.MSP_RAW_IMU

                // no clue about scaling factor
                SENSOR_DATA.magnetometer[0] = mavmsg.xmag / 1090;// MSPCodes.MSP_RAW_IMU
                SENSOR_DATA.magnetometer[1] = mavmsg.ymag / 1090;// MSPCodes.MSP_RAW_IMU
                SENSOR_DATA.magnetometer[2] = mavmsg.zmag / 1090;// MSPCodes.MSP_RAW_IMU

                // buzz todo
                // unhandled :  time, temp, and id
                // WARNING an ID != 0 is a different IMU, unhandled 

                RC.active_channels = 16;  // fake it

                break;
            case mavlink20.MAVLINK_MSG_ID_RC_CHANNELS: // tis one
                /* ["time_boot_ms", "chancount", "chan1_raw", "chan2_raw", "chan3_raw", "chan4_raw", "chan5_raw", "chan6_raw", "chan7_raw", "chan8_raw", "chan9_raw", "chan10_raw", "chan11_raw", "chan12_raw", "chan13_raw", "chan14_raw", "chan15_raw", "chan16_raw", "chan17_raw", "chan18_raw", "rssi"]
                chan1_raw: 0
                chan2_raw: 0
                chan3_raw: 0
                chan4_raw: 0
                chan5_raw: 0
                chan6_raw: 0
                chan7_raw: 0
                chan8_raw: 0
                chan9_raw: 0
                chan10_raw: 0
                chan11_raw: 0
                chan12_raw: 0
                chan13_raw: 0
                chan14_raw: 0
                chan15_raw: 0
                chan16_raw: 0
                chan17_raw: 0
                chan18_raw: 0
                chancount: 0
                rssi: 0
                time_boot_ms: 5162925
                */
                RC.active_channels = mavmsg.chancount; // MSPCodes.MSP_RC
                RC.channels[0] = mavmsg.chan1_raw;     // MSPCodes.MSP_RC
                RC.channels[1] = mavmsg.chan2_raw;     // etc..
                RC.channels[2] = mavmsg.chan3_raw;
                RC.channels[3] = mavmsg.chan4_raw;
                RC.channels[4] = mavmsg.chan5_raw;
                RC.channels[5] = mavmsg.chan6_raw;
                RC.channels[6] = mavmsg.chan7_raw;
                RC.channels[7] = mavmsg.chan8_raw;
                RC.channels[8] = mavmsg.chan9_raw;
                RC.channels[9] = mavmsg.chan10_raw;
                RC.channels[10] = mavmsg.chan11_raw;
                RC.channels[11] = mavmsg.chan12_raw;
                RC.channels[12] = mavmsg.chan13_raw;
                RC.channels[13] = mavmsg.chan14_raw;
                RC.channels[14] = mavmsg.chan15_raw;
                RC.channels[15] = mavmsg.chan16_raw;
               // testing = testing+100;  if( testing > 1000 ) testing = 10;
               // RC.channels[16] = mavmsg.chan17_raw+1300;
               // RC.channels[17] = mavmsg.chan18_raw+1400;

                // buzz - one of these is wrong? probably scaled wrong too
                MISC.rssi_channel = mavmsg.rssi  ; //SPCodes.MSPV2_ARDUPILOT_MISC: 
                ANALOG.rssi = mavmsg.rssi; //data.getUint16(offset, true); // 0-1023 MSPCodes.MSPV2_ARDUPILOT_ANALOG:

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_SERVO_OUTPUT_RAW: // tis one
                /* ["time_usec", "port", "servo1_raw", "servo2_raw", "servo3_raw", "servo4_raw", "servo5_raw", "servo6_raw", "servo7_raw", "servo8_raw", "servo9_raw", "servo10_raw", "servo11_raw", "servo12_raw", "servo13_raw", "servo14_raw", "servo15_raw", "servo16_raw"]
                port: 0
                servo1_raw: 1100
                servo2_raw: 1100
                servo3_raw: 1100
                servo4_raw: 1100
                servo5_raw: 0
                servo6_raw: 0
                servo7_raw: 0
                servo8_raw: 0
                servo9_raw: 0
                servo10_raw: 0
                servo11_raw: 0
                servo12_raw: 0
                servo13_raw: 0
                servo14_raw: 0
                servo15_raw: 0
                servo16_raw: 0
                time_usec: 867958229
                */
               // buzz randomly chose 8 'servos' and 8 'motors here', msp isn't that strict.
                // first 8 ardupilot servos are servos 
                SERVO_DATA[0] = mavmsg.servo1_raw;  //MSPCodes.MSP_SERVO
                SERVO_DATA[1] = mavmsg.servo2_raw;  //MSPCodes.MSP_SERVO
                SERVO_DATA[2] = mavmsg.servo3_raw;  //MSPCodes.MSP_SERVO
                SERVO_DATA[3] = mavmsg.servo4_raw;  //MSPCodes.MSP_SERVO
                SERVO_DATA[4] = mavmsg.servo5_raw;  //MSPCodes.MSP_SERVO
                SERVO_DATA[5] = mavmsg.servo6_raw;  //MSPCodes.MSP_SERVO
                SERVO_DATA[6] = mavmsg.servo7_raw;  //MSPCodes.MSP_SERVO
                SERVO_DATA[7] = mavmsg.servo8_raw;  //MSPCodes.MSP_SERVO
                //- second 8 ardupilot servos are 'motors'..?
                var rand2 = Math.floor(Math.random() * 100) + 1;  //1-100
                MOTOR_DATA[0] = rand2;// mavmsg.servo9_raw;  //MSPCodes.MSP_SERVO
                MOTOR_DATA[1] = rand2;//mavmsg.servo10_raw;  //MSPCodes.MSP_SERVO
                MOTOR_DATA[2] = rand2;//mavmsg.servo11_raw;  //MSPCodes.MSP_SERVO
                MOTOR_DATA[3] = rand2;//mavmsg.servo12_raw;  //MSPCodes.MSP_SERVO
                MOTOR_DATA[4] = rand2;//mavmsg.servo13_raw;  //MSPCodes.MSP_SERVO
                MOTOR_DATA[5] = rand2;//mavmsg.servo14_raw;  //MSPCodes.MSP_SERVO
                MOTOR_DATA[6] = rand2;//mavmsg.servo15_raw;  //MSPCodes.MSP_SERVO
                MOTOR_DATA[7] = rand2;//mavmsg.servo16_raw;  //MSPCodes.MSP_SERVO

                // todo 'port' is unhandled. dont know what ardu uses it for?

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_VFR_HUD:
                /* ["airspeed", "groundspeed", "heading", "throttle", "alt", "climb"]
                airspeed: 0
                alt: -8.119999885559082
                climb: -0.014790529385209084
                groundspeed: 0.01852068305015564
                heading: 178
                throttle: 0
                */

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_MISSION_CURRENT:
                /* ["seq"]
                seq: 0
                */

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_NAV_CONTROLLER_OUTPUT:
                /*["nav_roll", "nav_pitch", "nav_bearing", "target_bearing", "wp_dist", "alt_error", "aspd_error", "xtrack_error"]
                alt_error: 8.410773277282715
                aspd_error: 0
                nav_bearing: 178
                nav_pitch: 0.00021991602261550725
                nav_roll: 0.00017323991050943732
                target_bearing: 0
                wp_dist: 0
                xtrack_error: 0
                */

                // buzz todo
                break;

            case mavlink20.MAVLINK_MSG_ID_MEMINFO:
                /*["brkval", "freemem", "freemem32"]
                brkval: 0
                freemem: 53536
                freemem32: 53536
                */

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_POWER_STATUS:
            /* ["Vcc", "Vservo", "flags"]
                Vcc: 5122
                Vservo: 108
                flags: 4

            */
                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_SYS_STATUS:
                /*["onboard_control_sensors_present", "onboard_control_sensors_enabled", "onboard_control_sensors_health", "load", "voltage_battery", "current_battery", "battery_remaining", "drop_rate_comm", "errors_comm", "errors_count1", "errors_count2", "errors_count3", "errors_count4"]
                battery_remaining: 74
                current_battery: 59
                drop_rate_comm: 0
                errors_comm: 0
                errors_count1: 0
                errors_count2: 0
                errors_count3: 0
                errors_count4: 0
                load: 540
                onboard_control_sensors_enabled: 309337231
                onboard_control_sensors_health: 55614479
                onboard_control_sensors_present: 326171791
                voltage_battery: 510
                */

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_GLOBAL_POSITION_INT:
                /* ["time_boot_ms", "lat", "lon", "alt", "relative_alt", "vx", "vy", "vz", "hdg"]
                alt: -8120
                hdg: 17862
                lat: 0
                lon: 0
                relative_alt: -8126
                time_boot_ms: 5162922
                vx: 1
                vy: 0
                vz: 1
                */
                //GPS_DATA.fix = mavmsg.fix_type ; // data.getUint8(0);  MSPCodes.MSP_RAW_GPS:

                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_ATTITUDE:
                /* ["time_boot_ms", "roll", "pitch", "yaw", "rollspeed", "pitchspeed", "yawspeed"]
                pitch: -0.03153713047504425
                pitchspeed: 0.0013070395216345787
                roll: 0.05391024798154831
                rollspeed: 0.000017999147530645132
                time_boot_ms: 5162922
                yaw: 3.117539882659912
                yawspeed: 0.000008267234079539776
                */

                // works with positive range 0-360 only.
                function wrap_360 ( angle_degs) {
                    var remains = angle_degs % 360.0; //% = modulo
                    if (remains < 0.0) {
                        remains += 360; 
                    }
                    return remains;
                }
                function wrap_180( angle_degs) {
                    var remains = wrap_360 ( angle_degs);
                    if ( remains > 180.0) {
                        remains -= 360.0;
                    }
                    return remains;
                }
                //var x = wrap_180(5);
                //var y = wrap_180(190);
                //var z = wrap_180(-270);
                //var a = wrap_180(-370);

               // kinematics is degreees, mavlink is radians
                SENSOR_DATA.kinematics[0]  = (mavmsg.roll * 180/3.14159).toFixed(2); //roll = x   MSPCodes.MSP_ATTITUDE:
                SENSOR_DATA.kinematics[1]  = -(mavmsg.pitch * 180/3.14159).toFixed(2); // y  MSPCodes.MSP_ATTITUDE:
                // kinematics is 0-360 but 180 degrewss off
                SENSOR_DATA.kinematics[2]  = 360-(180-(mavmsg.yaw * 180/3.14159)).toFixed(2); // z           MSPCodes.MSP_ATTITUDE:

                // the thre 'speed' values are unused.

                // buzz todo
                break;
                                                            
                

            // todo more

            case mavlink20.MAVLINK_MSG_ID_SENSOR_OFFSETS:
                /*["mag_ofs_x", "mag_ofs_y", "mag_ofs_z", "mag_declination", "raw_press", "raw_temp", "gyro_cal_x", "gyro_cal_y", "gyro_cal_z", "accel_cal_x", "accel_cal_y", "accel_cal_z"]
                accel_cal_x: 0
                accel_cal_y: 0
                accel_cal_z: 0
                gyro_cal_x: -0.0028628804720938206
                gyro_cal_y: 0.011249365285038948
                gyro_cal_z: -0.06624391674995422
                mag_declination: 0
                mag_ofs_x: 50
                mag_ofs_y: 29
                mag_ofs_z: 7
                raw_press: 102503
                raw_temp: 5083
                */
                
                //MSPCodes.MSP_CALIBRATION_DATA: ?

                // i have NO idea if CALIBRATION_DATA.accZero  or  CALIBRATION_DATA.accGain should get these:
                // CALIBRATION_DATA.accZero.X = mavmsg.accel_cal_x ;
                // CALIBRATION_DATA.accZero.Y =  mavmsg.accel_cal_y ;
                // CALIBRATION_DATA.accZero.Z =  mavmsg.accel_cal_z ;
                // //?
                // //CALIBRATION_DATA.accGain.X = data.getInt16(7, true);
                // //CALIBRATION_DATA.accGain.Y = data.getInt16(9, true);
                // //CALIBRATION_DATA.accGain.Z = data.getInt16(11, true);

                // // i have NO idea if CALIBRATION_DATA.magZero  or  CALIBRATION_DATA.magGain should get these:
                // CALIBRATION_DATA.magZero.X = mavmsg.mag_ofs_x ;
                // CALIBRATION_DATA.magZero.Y = mavmsg.mag_ofs_y ;
                // CALIBRATION_DATA.magZero.Z = mavmsg.mag_ofs_z ;
                //?
                //CALIBRATION_DATA.magGain.X = data.getInt16(21, true);
                //CALIBRATION_DATA.magGain.Y = data.getInt16(23, true);
                //CALIBRATION_DATA.magGain.Z = data.getInt16(25, true);

                // todo used here: 
                //raw_temp , raw_press 
                //and three gyro_cal_x/gyro_cal_y/gyro_cal_z
                // and mag_declination
            
                // buzz todo
                break;
            case mavlink20.MAVLINK_MSG_ID_PARAM_VALUE:
                /* ["param_id", "param_value", "param_type", "param_count", "param_index"]
                param_count: 1022
                param_id: "STAT_RUNTIME"
                param_index: 65535
                param_type: 6
                param_value: 0
                */
                if  ( mavmsg.param_id.startsWith("STAT_RUNTIME") ) { break;} // skip this

                //console.log('recieving-->');console.log(mavmsg); //BUZZ uncomment to see fully parsed arriving packets in all their glory

                // buzz todo
                break; 

            case mavlink20.MAVLINK_MSG_ID_STATUSTEXT:
                /* ["severity", "text", "id", "chunk_seq"]
                severity: 2
                text: "PreArm: Throttle below Failsafe[][][][][][][]][][][]][][]][]][][]]"
                chunk_seq: 0
                id: 0
                */
            
                // buzz todo
                break; 

                

            case mavlink20.MAVLINK_MSG_ID_WIND:
                /* ["direction", "speed", "speed_z"]
                direction: -180
                speed: 0
                speed_z: 0
                */
            
                // buzz todo
                break; 
                
            case mavlink20.MAVLINK_MSG_ID_POSITION_TARGET_GLOBAL_INT:
                /*["time_boot_ms", "coordinate_frame", "type_mask", "lat_int", "lon_int", "alt", "vx", "vy", "vz", "afx", "afy", "afz", "yaw", "yaw_rate"]
                afx: 0
                afy: 0
                afz: 0
                alt: 100
                coordinate_frame: 0
                lat_int: 0
                lon_int: 0
                time_boot_ms: 61609
                type_mask: 65528
                vx: 0
                vy: 0
                vz: 0
                yaw: 0
                yaw_rate: 0
                */
            
                // buzz todo
                break; 
                
            case mavlink20.MAVLINK_MSG_ID_AOA_SSA:
                /* ["time_usec", "AOA", "SSA"]
                time_usec: (3) [62028591, 0, true]    
                AOA: 0
                SSA: 0
                */
            
                // buzz todo
                break; 

            // https://mavlink.io/en/services/command.html 
            // https://mavlink.io/en/messages/common.html#mav_commands
            case mavlink20.MAVLINK_MSG_ID_COMMAND_LONG:
                /* ["target_system", "target_component", "command", "confirmation", "param1", "param2", "param3", "param4", "param5", "param6", "param7"]
                command: 241
                confirmation: 0
                param1: 0
                param2: 0
                param3: 0
                param4: 0
                param5: 1
                param6: 0
                param7: 0
                target_component: 1
                target_system: 1
                */
            
                // 
                switch ( mavmsg.command ) { //any of MAV_CMD_*  's 
                    case mavlink20.MAV_CMD_ACCELCAL_VEHICLE_POS:  //
                        FC.longyREQ = mavmsg.param1; // veh pos 1 means 'please level' then ack., 
                        console.log('receiving COMMAND_LONG MAV_CMD_ACCELCAL_VEHICLE_POS -->');console.log(mavmsg); //BUZZ uncomment to see fully parsed arriving packets in all their glory

                        break;
                    case mavlink20.MAV_CMD_DO_SET_MODE: // 176 
                        // buzz todo, this is the acknowledgement of a mode-change request.
                        break;

                    default:
                        // emit detals about unknown COMMAND_LONG packets
                        console.log('receiving unhandled COMMAND_LONG -->');console.log(mavmsg); //BUZZ uncomment to see fully parsed arriving packets in all their glory
                        break;
                }

                // buzz todo
                break; 

            //https://github.com/mavlink/c_library_v2/blob/master/ardupilotmega/mavlink_msg_mag_cal_progress.h
            case mavlink20.MAVLINK_MSG_ID_MAG_CAL_PROGRESS: // 191
                /* ["compass_id", "cal_mask", "cal_status", "attempt", "completion_pct", "completion_mask", "direction_x", "direction_y", "direction_z"]
                attempt: 1
                cal_mask: 1
                cal_status: 2
                compass_id: 0
                completion_mask: "XXXXXXXXX"
                completion_pct: 0
                direction_x: 0
                direction_y: 0
                direction_z: 0
                */

                var c_id = mavmsg.compass_id;

                var mask = mavmsg.completion_mask; // buzz

                console.log('Progress? :',mavmsg.completion_pct);


                
                // buzz todo
                break;

                //https://mavlink.io/en/messages/common.html#MAG_CAL_REPORT
                case mavlink20.MAVLINK_MSG_ID_MAG_CAL_REPORT: // 192
                /*["compass_id", "cal_mask", "cal_status", "autosaved", "fitness", "ofs_x", "ofs_y", "ofs_z", "diag_x", "diag_y", "diag_z", "offdiag_x", "offdiag_y", "offdiag_z", "orientation_confidence", "old_orientation", "new_orientation", "scale_factor"]
                autosaved: 1
                cal_mask: 1
                cal_status: 4
                compass_id: 0
                diag_x: 1.00935959815979
                diag_y: 0.9637462496757507
                diag_z: 1.007657766342163
                fitness: 12.47597885131836
                new_orientation: 0
                offdiag_x: -0.0018800647230818868
                offdiag_y: -0.000028397449568728916
                offdiag_z: 0.01615700125694275
                ofs_x: 100.86463165283203
                ofs_y: 79.57767486572266
                ofs_z: 53.80006790161133
                old_orientation: 0
                orientation_confidence: 18.874120712280273
                scale_factor: 0
                */

                // CALIBRATION_DATA.accZero.X =  mavmsg.accel_cal_x ;
                // CALIBRATION_DATA.accZero.Y =  mavmsg.accel_cal_y ;
                // CALIBRATION_DATA.accZero.Z =  mavmsg.accel_cal_z ;
                // //?
                // CALIBRATION_DATA.accGain.X = mavmsg.;//data.getInt16(7, true);
                // CALIBRATION_DATA.accGain.Y = mavmsg.;//data.getInt16(9, true);
                // CALIBRATION_DATA.accGain.Z = mavmsg.ofs_z;//data.getInt16(11, true);
                //
                CALIBRATION_DATA.magZero.X = mavmsg.ofs_x ;
                CALIBRATION_DATA.magZero.Y = mavmsg.ofs_y ;
                CALIBRATION_DATA.magZero.Z = mavmsg.ofs_z ;
                //
                CALIBRATION_DATA.magGain.X = mavmsg.offdiag_x;//data.getInt16(21, true);
                CALIBRATION_DATA.magGain.Y = mavmsg.offdiag_y;//data.getInt16(23, true);
                CALIBRATION_DATA.magGain.Z = mavmsg.offdiag_z;//data.getInt16(25, true);

                if (mavmsg.cal_status == mavlink20.MAG_CAL_SUCCESS){ //4
                    console.log('MAG_CAL_SUCCESS!! :',100); // 100 % completed

                    FC.curr_mav_state['MAG_CAL_PROGRESS'].completed = 1; // this boolean is not in the mav stream directly.

                    // artificially fill in completion mast as 100%, if it exists.
                    if ( FC.curr_mav_state && FC.curr_mav_state['MAG_CAL_PROGRESS'] && FC.curr_mav_state['MAG_CAL_PROGRESS'].completion_mask  ){
                      FC.curr_mav_state['MAG_CAL_PROGRESS'].completion_mask = String.fromCharCode(254,254,254,254,254,254,254,254,254,254);
                    }

                } else {

                    FC.curr_mav_state['MAG_CAL_PROGRESS'].completed = 0; // this boolean is not in the mav stream directly.

                    switch ( mavmsg.cal_status ) {
                        case mavlink20.MAG_CAL_NOT_STARTED:
                            console.log('MAG_CAL_NOT_STARTED'); 
                            break;
                        case mavlink20.MAG_CAL_WAITING_TO_START:
                            console.log('MAG_CAL_WAITING_TO_START'); 
                            break; 
                        case mavlink20.MAG_CAL_RUNNING_STEP_ONE:
                            console.log('MAG_CAL_RUNNING_STEP_ONE'); 
                            break; 
                        case mavlink20.MAG_CAL_RUNNING_STEP_TWO:
                            console.log('MAG_CAL_RUNNING_STEP_TWO'); 
                            break; 
                        //case mavlink20.MAG_CAL_SUCCESS:
                        //    console.log('MAG_CAL_SUCCESS'); 
                        //    break; 
                        case mavlink20.MAG_CAL_FAILED:
                            console.log('MAG_CAL_FAILED'); 
                            break;
                        case mavlink20.MAG_CAL_BAD_ORIENTATION:
                            console.log('MAG_CAL_BAD_ORIENTATION'); 
                            break;
                        case mavlink20.MAG_CAL_BAD_RADIUS:
                            console.log('MAG_CAL_BAD_RADIUS'); 
                            break;
                        case mavlink20.MAG_CAL_STATUS_ENUM_END:
                            console.log('MAG_CAL_STATUS_ENUM_END'); 
                            break;
                    }

                }

                
                // buzz todo
                break;
                

            // this is teh ack for the above ..LONG:
            case mavlink20.MAVLINK_MSG_ID_COMMAND_ACK:
                /* ["command", "result", "progress", "result_param2", "target_system", "target_component"]
                command: 241
                progress: 0
                result: 0
                result_param2: 0
                target_component: 0
                target_system: 0
                */
            
                // buzz todo
                console.log('receiving COMMAND_ACK -->');console.log(mavmsg); //BUZZ uncomment to see fully parsed arriving packets in all their glory
                //FC.longyRES = mavmsg.result;

                break;

            case mavlink20.MAVLINK_MSG_ID_GPS_GLOBAL_ORIGIN:
                /* ["latitude", "longitude", "altitude", "time_usec"]
                altitude: 104100
                latitude: -273895825
                longitude: 1524649356
                time_usec: (3) [1430454256, 0, true]
                */
                //console.log('receiving GPS_GLOBAL_ORIGIN');console.log(mavmsg);
                // buzz todo
                break; 

            case mavlink20.MAVLINK_MSG_ID_HOME_POSITION:
                /* ["latitude", "longitude", "altitude", "x", "y", "z", "q", "approach_x", "approach_y", "approach_z", "time_usec"]
                altitude: 104100
                approach_x: 0
                approach_y: 0
                approach_z: 0
                latitude: -273895825
                longitude: 1524649353
                q: (4) [1, 0, 0, 0]
                time_usec: (3) [1430454256, 0, true]
                x: 0
                y: 0
                z: 0
                */
                //console.log('receiving HOME_POSITION');console.log(mavmsg);
                // buzz todo
                break; 

            case mavlink20.MAVLINK_MSG_ID_SCALED_IMU3:
                /* ["time_boot_ms", "xacc", "yacc", "zacc", "xgyro", "ygyro", "zgyro", "xmag", "ymag", "zmag", "temperature"]
                temperature: 0
                time_boot_ms: 1885853
                xacc: 0
                xgyro: 0
                xmag: -90
                yacc: 0
                ygyro: 0
                ymag: -251
                zacc: 0
                zgyro: 0
                zmag: -459
                */
                
                // buzz todo
                //console.log('receiving SCALED_IMU3');console.log(mavmsg);
                break; 

            case mavlink20.MAVLINK_MSG_ID_SCALED_PRESSURE2:
                /* ["time_boot_ms", "press_abs", "press_diff", "temperature", "temperature_press_diff"]
                press_abs: 1000.78515625
                press_diff: 0
                temperature: 3500
                temperature_press_diff: 0
                time_boot_ms: 1885853
                */
            
                // buzz todo
                break; 

            case mavlink20.MAVLINK_MSG_ID_SIMSTATE:
                /* ["roll", "pitch", "yaw", "xacc", "yacc", "zacc", "xgyro", "ygyro", "zgyro", "lat", "lng"]
                lat: -273895825
                lng: 1524649356
                pitch: 0
                roll: 0
                xacc: 0
                xgyro: 0
                yacc: -0
                yaw: 2.094395160675049
                ygyro: 0
                zacc: -9.806650161743164
                zgyro: 0
                */
            
                // buzz todo
                break; 

            case mavlink20.MAVLINK_MSG_ID_TERRAIN_REPORT:
                /* ["lat", "lon", "spacing", "terrain_height", "current_height", "pending", "loaded"]
                current_height: 0.14000000059604645
                lat: -273895825
                loaded: 504
                lon: 1524649354
                pending: 0
                spacing: 100
                terrain_height: 103.01937866210938
                */
            
                // buzz todo
                break; 

            case mavlink20.MAVLINK_MSG_ID_LOCAL_POSITION_NED:
                /* ["time_boot_ms", "x", "y", "z", "vx", "vy", "vz"]
                time_boot_ms: 1885853
                vx: -0.007206640671938658
                vy: -0.029007868841290474
                vz: -0.00868823379278183
                x: -0.00715320510789752
                y: -0.029470769688487053
                z: -0.149393230676651
                */
            
                // buzz todo
                break; 

            case mavlink20.MAVLINK_MSG_ID_TERRAIN_REQUEST: 
                /*  ["lat", "lon", "grid_spacing", "mask"]
                grid_spacing: 100
                lat: -273963287
                lon: 1524558001
                mask: (3) [4294967295, 16777215, true]
                */ 
            
                // buzz todo 
                break;  

            case mavlink20.MAVLINK_MSG_ID_AIRSPEED_AUTOCAL: 
                /* ["vx", "vy", "vz", "diff_pressure", "EAS2TAS", "ratio", "state_x", "state_y", "state_z", "Pax", "Pby", "Pcz"]
                EAS2TAS: 1.0456035137176514
                Pax: 100
                Pby: 100
                Pcz: 9.999999974752427e-7
                diff_pressure: 244.17919921875
                ratio: 1.9936000108718872
                state_x: 0
                state_y: 0
                state_z: 0.7082408666610718
                vx: -12.03700065612793
                vy: 18.540000915527344
                vz: -0.0560000017285347
                */ 
            
                // buzz todo 
                break;  



                            
            case mavlink20.MAVLINK_MSG_ID_MISSION_ITEM_REACHED:  //46
                /*  ["seq"]
                seq: 7
                // note that _header.srcSystem give the vehicle sysid that it came from as well
                */ 
                // buzz todo 
                break;  

            case mavlink20.MAVLINK_MSG_ID_MISSION_ITEM_INT: // 73
            case mavlink20.MAVLINK_MSG_ID_MISSION_ITEM: //39
            case mavlink20.MAVLINK_MSG_ID_MISSION_REQUEST_INT: //51
            case mavlink20.MAVLINK_MSG_ID_MISSION_REQUEST: //40
            case mavlink20.MAVLINK_MSG_ID_MISSION_ACK: //47

                // buzz todo 
                break; 

            // add more here 
                    
            // case mavlink20.MAVLINK_MSG_ID_SENSOR_OFFSETS: 
            //     /* 
            //     */ 
            // 
            //     // buzz todo 
            //     break; 
            case mavlink20.MAVLINK_MSG_ID_RADIO_STATUS:
                break;
            
            case mavlink20.MAVLINK_MSG_ID_BAD_DATA:
                break;

            case mavlink20.MAVLINK_MSG_ID_ESC_TELEMETRY_1_TO_4:
                break;

            case mavlink20.MAVLINK_MSG_ID_ESC_TELEMETRY_5_TO_8:
                break;
    
            case mavlink20.MAVLINK_MSG_ID_FILE_TRANSFER_PROTOCOL:
                //todo
                break;

            default:
                // todo

              // emit detals about unknown packets?
              console.log('recieving unhandled-->');console.log(mavmsg); //BUZZ uncomment to see fully parsed arriving packets in all their glory

                break;
        }

    }
    
    /**
     *
     * @param {MSP} dataHandler
     * 
     * note: this pprocesses INCOMING to the GCS data...  
     */
    self.processData = function (dataHandler) {
        var data = new DataView(dataHandler.message_buffer, 0), // DataView (allowing us to view arrayBuffer as struct/union)
            offset = 0,
            needle = 0,
            i = 0,
            buff = [],
            identifier = '',
            flags,
            colorCount,
            color;
        if (!dataHandler.unsupported || dataHandler.unsupported) switch (dataHandler.code) {
         /*   case MSPCodes.MSP_IDENT:
                //FIXME remove this frame when proven not needed
                console.log('Using deprecated msp command: MSP_IDENT');
                // Deprecated
                CONFIG.version = parseFloat((data.getUint8(0) / 100).toFixed(2));
                CONFIG.multiType = data.getUint8(1);
                CONFIG.msp_version = data.getUint8(2);
                CONFIG.capability = data.getUint32(3, true);
                break;
            case MSPCodes.MSP_STATUS:
                console.log('Using deprecated msp command: MSP_STATUS');
                CONFIG.cycleTime = data.getUint16(0, true);
                CONFIG.i2cError = data.getUint16(2, true);
                CONFIG.activeSensors = data.getUint16(4, true);
                CONFIG.mode = data.getUint32(6, true);
                CONFIG.profile = data.getUint8(10);
                gui.updateProfileChange();
                gui.updateStatusBar();
                break; */
            case MSPCodes.MSP_STATUS_EX:
                CONFIG.cycleTime = data.getUint16(0, true);
                CONFIG.i2cError = data.getUint16(2, true); // MAVLINK_MSG_ID_HWSTATUS.I2Cerr
                CONFIG.activeSensors = data.getUint16(4, true);
                CONFIG.profile = data.getUint8(10);
                CONFIG.cpuload = data.getUint16(11, true);
                CONFIG.armingFlags = data.getUint16(13, true);
                gui.updateStatusBar();
                gui.updateProfileChange();
                break;

            case MSPCodes.MSPV2_ARDUPILOT_STATUS:
                CONFIG.cycleTime = data.getUint16(offset, true);
                offset += 2;
                CONFIG.i2cError = data.getUint16(offset, true);
                offset += 2;
                CONFIG.activeSensors = data.getUint16(offset, true);
                offset += 2;
                CONFIG.cpuload = data.getUint16(offset, true);
                offset += 2;
                var profile_byte = data.getUint8(offset++)
                CONFIG.profile = profile_byte & 0x0F;
                CONFIG.battery_profile = (profile_byte & 0xF0) >> 4;
                CONFIG.armingFlags = data.getUint32(offset, true);
                offset += 4;
                gui.updateStatusBar();
                gui.updateProfileChange();
                break;

            case MSPCodes.MSP_ACTIVEBOXES:
                var words = dataHandler.message_length_expected / 4;

                CONFIG.mode = [];
                for (i = 0; i < words; ++i)
                    CONFIG.mode.push(data.getUint32(i * 4, true));
                break;

            case MSPCodes.MSP_SENSOR_STATUS:
                SENSOR_STATUS.isHardwareHealthy = data.getUint8(0);
                SENSOR_STATUS.gyroHwStatus = data.getUint8(1);
                SENSOR_STATUS.accHwStatus = data.getUint8(2);
                SENSOR_STATUS.magHwStatus = data.getUint8(3);
                SENSOR_STATUS.baroHwStatus = data.getUint8(4);
                SENSOR_STATUS.gpsHwStatus = data.getUint8(5);
                SENSOR_STATUS.rangeHwStatus = data.getUint8(6);
                SENSOR_STATUS.speedHwStatus = data.getUint8(7);
                SENSOR_STATUS.flowHwStatus = data.getUint8(8);
                sensor_status_ex(SENSOR_STATUS);
                break;

            case MSPCodes.MSP_RAW_IMU:
                // 512 for mpu6050, 256 for mma
                // currently we are unable to differentiate between the sensor types, so we are goign with 512
                SENSOR_DATA.accelerometer[0] = data.getInt16(0, true) / 512;
                SENSOR_DATA.accelerometer[1] = data.getInt16(2, true) / 512;
                SENSOR_DATA.accelerometer[2] = data.getInt16(4, true) / 512;

                // properly scaled
                SENSOR_DATA.gyroscope[0] = data.getInt16(6, true) * (4 / 16.4);
                SENSOR_DATA.gyroscope[1] = data.getInt16(8, true) * (4 / 16.4);
                SENSOR_DATA.gyroscope[2] = data.getInt16(10, true) * (4 / 16.4);

                // no clue about scaling factor
                SENSOR_DATA.magnetometer[0] = data.getInt16(12, true) / 1090;
                SENSOR_DATA.magnetometer[1] = data.getInt16(14, true) / 1090;
                SENSOR_DATA.magnetometer[2] = data.getInt16(16, true) / 1090;
                break;
            case MSPCodes.MSP_SERVO:
                var servoCount = dataHandler.message_length_expected / 2;
                for (i = 0; i < servoCount; i++) {
                    SERVO_DATA[i] = data.getUint16(needle, true);

                    needle += 2;
                }
                break;
            case MSPCodes.MSP_MOTOR:
                var motorCount = dataHandler.message_length_expected / 2;
                for (i = 0; i < motorCount; i++) {
                    MOTOR_DATA[i] = data.getUint16(needle, true);

                    needle += 2;
                }
                break;
            case MSPCodes.MSP_RC:
                //RC.active_channels = dataHandler.message_length_expected / 2;
                //
                //for (i = 0; i < RC.active_channels; i++) {
                //    RC.channels[i] = data.getUint16((i * 2), true);
                //}
                break;
            case MSPCodes.MSP_RAW_GPS:
                GPS_DATA.fix = data.getUint8(0);
                GPS_DATA.numSat = data.getUint8(1);
                GPS_DATA.lat = data.getInt32(2, true);
                GPS_DATA.lon = data.getInt32(6, true);
                GPS_DATA.alt = data.getInt16(10, true);
                GPS_DATA.speed = data.getUint16(12, true);
                GPS_DATA.ground_course = data.getUint16(14, true);
                GPS_DATA.hdop = data.getUint16(16, true);
                break;
            case MSPCodes.MSP_COMP_GPS:
                GPS_DATA.distanceToHome = data.getUint16(0, 1);
                GPS_DATA.directionToHome = data.getUint16(2, 1);
                GPS_DATA.update = data.getUint8(4);
                break;
            case MSPCodes.MSP_GPSSTATISTICS:
                GPS_DATA.messageDt = data.getUint16(0, true);
                GPS_DATA.errors = data.getUint32(2, true);
                GPS_DATA.timeouts = data.getUint32(6, true);
                GPS_DATA.packetCount = data.getUint32(10, true);
                GPS_DATA.hdop = data.getUint16(14, true);
                GPS_DATA.eph = data.getUint16(16, true);
                GPS_DATA.epv = data.getUint16(18, true);
                break;
            case MSPCodes.MSP_ATTITUDE:
                SENSOR_DATA.kinematics[0] = data.getInt16(0, true) / 10.0; // x
                SENSOR_DATA.kinematics[1] = data.getInt16(2, true) / 10.0; // y
                SENSOR_DATA.kinematics[2] = data.getInt16(4, true); // z
                break;
            case MSPCodes.MSP_ALTITUDE:
                SENSOR_DATA.altitude = parseFloat((data.getInt32(0, true) / 100.0).toFixed(2)); // correct scale factor
                SENSOR_DATA.barometer = parseFloat((data.getInt32(6, true) / 100.0).toFixed(2)); // correct scale factor
                break;
            case MSPCodes.MSP_SONAR:
                SENSOR_DATA.sonar = data.getInt32(0, true);
                break;
            case MSPCodes.MSPV2_ARDUPILOT_AIR_SPEED:
                SENSOR_DATA.air_speed = data.getInt32(0, true);
                break;
            case MSPCodes.MSP_ANALOG:
                ANALOG.voltage = data.getUint8(0) / 10.0;
                ANALOG.mAhdrawn = data.getUint16(1, true);
                ANALOG.rssi = data.getUint16(3, true); // 0-1023
                ANALOG.amperage = data.getInt16(5, true) / 100; // A
                break;
            case MSPCodes.MSPV2_ARDUPILOT_ANALOG:
                let tmp = data.getUint8(offset++);
                ANALOG.battery_full_when_plugged_in = (tmp & 1 ? true : false);
                ANALOG.use_capacity_thresholds = ((tmp & 2) >> 1 ? true : false);
                ANALOG.battery_state = (tmp & 12) >> 2;
                ANALOG.cell_count = (tmp & 0xF0) >> 4;
                ANALOG.voltage = data.getUint16(offset, true) / 100.0;
                offset += 2;
                ANALOG.amperage = data.getInt16(offset, true) / 100; // A
                offset += 2;
                ANALOG.power = data.getInt32(offset, true) / 100.0;
                offset += 4;
                ANALOG.mAhdrawn = data.getInt32(offset, true);
                offset += 4;
                ANALOG.mWhdrawn = data.getInt32(offset, true);
                offset += 4;
                ANALOG.battery_remaining_capacity = data.getUint32(offset, true);
                offset += 4;
                ANALOG.battery_percentage = data.getUint8(offset++);
                ANALOG.rssi = data.getUint16(offset, true); // 0-1023
                offset += 2;
                //noinspection JSValidateTypes
                dataHandler.analog_last_received_timestamp = Date.now();
                break;
            case MSPCodes.MSP_RC_TUNING:
                RC_tuning.RC_RATE = parseFloat((data.getUint8(offset++) / 100).toFixed(2));
                RC_tuning.RC_EXPO = parseFloat((data.getUint8(offset++) / 100).toFixed(2));
                RC_tuning.roll_pitch_rate = 0;
                RC_tuning.roll_rate = parseFloat((data.getUint8(offset++) * 10));
                RC_tuning.pitch_rate = parseFloat((data.getUint8(offset++) * 10));
                RC_tuning.yaw_rate = parseFloat((data.getUint8(offset++) * 10));

                RC_tuning.dynamic_THR_PID = parseInt(data.getUint8(offset++));
                RC_tuning.throttle_MID = parseFloat((data.getUint8(offset++) / 100).toFixed(2));
                RC_tuning.throttle_EXPO = parseFloat((data.getUint8(offset++) / 100).toFixed(2));
                RC_tuning.dynamic_THR_breakpoint = data.getUint16(offset, true);
                offset += 2;
                RC_tuning.RC_YAW_EXPO = parseFloat((data.getUint8(offset++) / 100).toFixed(2));
                break;
            case MSPCodes.MSPV2_ARDUPILOT_RATE_PROFILE:
                // compat
                RC_tuning.RC_RATE = 100;
                RC_tuning.roll_pitch_rate = 0;

                // throttle
                RC_tuning.throttle_MID = parseFloat((data.getUint8(offset++) / 100).toFixed(2));
                RC_tuning.throttle_EXPO = parseFloat((data.getUint8(offset++) / 100).toFixed(2));
                RC_tuning.dynamic_THR_PID = parseInt(data.getUint8(offset++));
                RC_tuning.dynamic_THR_breakpoint = data.getUint16(offset, true);
                offset += 2;

                // stabilized
                RC_tuning.RC_EXPO = parseFloat((data.getUint8(offset++) / 100).toFixed(2));
                RC_tuning.RC_YAW_EXPO = parseFloat((data.getUint8(offset++) / 100).toFixed(2));
                RC_tuning.roll_rate = data.getUint8(offset++) * 10;
                RC_tuning.pitch_rate = data.getUint8(offset++) * 10;
                RC_tuning.yaw_rate = data.getUint8(offset++) * 10;

                // manual
                RC_tuning.manual_RC_EXPO = parseFloat((data.getUint8(offset++) / 100).toFixed(2));
                RC_tuning.manual_RC_YAW_EXPO = parseFloat((data.getUint8(offset++) / 100).toFixed(2));
                RC_tuning.manual_roll_rate = data.getUint8(offset++);
                RC_tuning.manual_pitch_rate = data.getUint8(offset++);
                RC_tuning.manual_yaw_rate = data.getUint8(offset++);
                break;
            case MSPCodes.MSP_PID:
                // PID data arrived, we need to scale it and save to appropriate bank / array
                for (i = 0, needle = 0; i < (dataHandler.message_length_expected / 3); i++, needle += 3) {
                    PIDs[i][0] = data.getUint8(needle);
                    PIDs[i][1] = data.getUint8(needle + 1);
                    PIDs[i][2] = data.getUint8(needle + 2);
                }
                break;
            case MSPCodes.MSP2_PID:
                // PID data arrived, we need to scale it and save to appropriate bank / array
                for (i = 0, needle = 0; i < (dataHandler.message_length_expected / 4); i++, needle += 4) {
                    PIDs[i][0] = data.getUint8(needle);
                    PIDs[i][1] = data.getUint8(needle + 1);
                    PIDs[i][2] = data.getUint8(needle + 2);
                    PIDs[i][3] = data.getUint8(needle + 3);
                }
                break;
            case MSPCodes.MSP_ARMING_CONFIG:
                ARMING_CONFIG.auto_disarm_delay = data.getUint8(0);
                ARMING_CONFIG.disarm_kill_switch = data.getUint8(1);
                break;
            case MSPCodes.MSP_LOOP_TIME:
                FC_CONFIG.loopTime = data.getInt16(0, true);
                break;
            case MSPCodes.MSP_MISC: // 22 bytes
                MISC.midrc = data.getInt16(offset, true);
                offset += 2;
                MISC.minthrottle = data.getUint16(offset, true); // 0-2000
                offset += 2;
                MISC.maxthrottle = data.getUint16(offset, true); // 0-2000
                offset += 2;
                MISC.mincommand = data.getUint16(offset, true); // 0-2000
                offset += 2;
                MISC.failsafe_throttle = data.getUint16(offset, true); // 1000-2000
                offset += 2;
                MISC.gps_type = data.getUint8(offset++);
                MISC.sensors_baudrate = data.getUint8(offset++);
                MISC.gps_ubx_sbas = data.getInt8(offset++);
                MISC.multiwiicurrentoutput = data.getUint8(offset++);
                MISC.rssi_channel = data.getUint8(offset++);
                MISC.placeholder2 = data.getUint8(offset++);
                MISC.mag_declination = data.getInt16(offset, 1) / 10; // -18000-18000
                offset += 2;
                MISC.vbatscale = data.getUint8(offset++); // 10-200
                MISC.vbatmincellvoltage = data.getUint8(offset++) / 10; // 10-50
                MISC.vbatmaxcellvoltage = data.getUint8(offset++) / 10; // 10-50
                MISC.vbatwarningcellvoltage = data.getUint8(offset++) / 10; // 10-50
                break;
            case MSPCodes.MSPV2_ARDUPILOT_MISC:
                MISC.midrc = data.getInt16(offset, true);
                offset += 2;
                MISC.minthrottle = data.getUint16(offset, true); // 0-2000
                offset += 2;
                MISC.maxthrottle = data.getUint16(offset, true); // 0-2000
                offset += 2;
                MISC.mincommand = data.getUint16(offset, true); // 0-2000
                offset += 2;
                MISC.failsafe_throttle = data.getUint16(offset, true); // 1000-2000
                offset += 2;
                MISC.gps_type = data.getUint8(offset++);
                MISC.sensors_baudrate = data.getUint8(offset++);
                MISC.gps_ubx_sbas = data.getInt8(offset++);
                MISC.rssi_channel = data.getUint8(offset++);
                MISC.mag_declination = data.getInt16(offset, 1) / 10; // -18000-18000
                offset += 2;
                MISC.vbatscale = data.getUint16(offset, true);
                offset += 2;
                MISC.voltage_source = data.getUint8(offset++);
                MISC.battery_cells = data.getUint8(offset++);
                MISC.vbatdetectcellvoltage = data.getUint16(offset, true) / 100;
                offset += 2;
                MISC.vbatmincellvoltage = data.getUint16(offset, true) / 100;
                offset += 2;
                MISC.vbatmaxcellvoltage = data.getUint16(offset, true) / 100;
                offset += 2;
                MISC.vbatwarningcellvoltage = data.getUint16(offset, true) / 100;
                offset += 2;
                MISC.battery_capacity = data.getUint32(offset, true);
                offset += 4;
                MISC.battery_capacity_warning = data.getUint32(offset, true);
                offset += 4;
                MISC.battery_capacity_critical = data.getUint32(offset, true);
                offset += 4;
                MISC.battery_capacity_unit = (data.getUint8(offset++) ? 'mWh' : 'mAh');
                break;
            case MSPCodes.MSPV2_ARDUPILOT_SET_MISC:
                console.log('MISC ARDUPILOT Configuration saved');
                break;
            case MSPCodes.MSPV2_ARDUPILOT_BATTERY_CONFIG:
                BATTERY_CONFIG.vbatscale = data.getUint16(offset, true);
                offset += 2;
                BATTERY_CONFIG.voltage_source = data.getUint8(offset++);
                BATTERY_CONFIG.battery_cells = data.getUint8(offset++);
                BATTERY_CONFIG.vbatdetectcellvoltage = data.getUint16(offset, true) / 100;
                offset += 2;
                BATTERY_CONFIG.vbatmincellvoltage = data.getUint16(offset, true) / 100;
                offset += 2;
                BATTERY_CONFIG.vbatmaxcellvoltage = data.getUint16(offset, true) / 100;
                offset += 2;
                BATTERY_CONFIG.vbatwarningcellvoltage = data.getUint16(offset, true) / 100;
                offset += 2;
                BATTERY_CONFIG.current_offset = data.getUint16(offset, true);
                offset += 2;
                BATTERY_CONFIG.current_scale = data.getUint16(offset, true);
                offset += 2;
                BATTERY_CONFIG.capacity = data.getUint32(offset, true);
                offset += 4;
                BATTERY_CONFIG.capacity_warning = data.getUint32(offset, true);
                offset += 4;
                BATTERY_CONFIG.capacity_critical = data.getUint32(offset, true);
                offset += 4;
                BATTERY_CONFIG.battery_capacity_unit = (data.getUint8(offset++) ? 'mWh' : 'mAh');
                break;
            case MSPCodes.MSP_3D:
                REVERSIBLE_MOTORS.deadband_low = data.getUint16(offset, true);
                offset += 2;
                REVERSIBLE_MOTORS.deadband_high = data.getUint16(offset, true);
                offset += 2;
                REVERSIBLE_MOTORS.neutral = data.getUint16(offset, true);
                break;
            case MSPCodes.MSP_MOTOR_PINS:
                console.log(data);
                break;
            case MSPCodes.MSP_BOXNAMES:
                //noinspection JSUndeclaredVariable
                AUX_CONFIG = []; // empty the array as new data is coming in
                buff = [];
                for (i = 0; i < data.byteLength; i++) {
                    if (data.getUint8(i) == 0x3B) { // ; (delimeter char)
                        AUX_CONFIG.push(String.fromCharCode.apply(null, buff)); // convert bytes into ASCII and save as strings

                        // empty buffer
                        buff = [];
                    } else {
                        buff.push(data.getUint8(i));
                    }
                }
                break;
            case MSPCodes.MSP_PIDNAMES:
                //noinspection JSUndeclaredVariable
                PID_names = []; // empty the array as new data is coming in

                buff = [];
                for (i = 0; i < data.byteLength; i++) {
                    if (data.getUint8(i) == 0x3B) { // ; (delimiter char)
                        PID_names.push(String.fromCharCode.apply(null, buff)); // convert bytes into ASCII and save as strings

                        // empty buffer
                        buff = [];
                    } else {
                        buff.push(data.getUint8(i));
                    }
                }
                break;
            case MSPCodes.MSP_WP:
                MISSION_PLANER.put(new Waypoint(
                    data.getUint8(0),
                    data.getUint8(1),
                    data.getInt32(2, true),
                    data.getInt32(6, true),
                    data.getInt32(10, true),
                    data.getInt16(14, true),
                    data.getInt16(16, true),
                    data.getInt16(18, true)
                ));
                break;
            case MSPCodes.MSP_BOXIDS:
                //noinspection JSUndeclaredVariable
                AUX_CONFIG_IDS = []; // empty the array as new data is coming in

                for (i = 0; i < data.byteLength; i++) {
                    AUX_CONFIG_IDS.push(data.getUint8(i));
                }
                break;
            case MSPCodes.MSP_SERVO_MIX_RULES:
                SERVO_RULES.flush();
                if (data.byteLength % 8 === 0) {
                    for (i = 0; i < data.byteLength; i += 8) {
                        SERVO_RULES.put(new ServoMixRule(
                            data.getInt8(i),
                            data.getInt8(i + 1),
                            data.getInt16(i + 2, true),
                            data.getInt8(i + 4)
                        ));
                    }
                }
                SERVO_RULES.cleanup();

                break;
            case MSPCodes.MSP2_ARDUPILOT_SERVO_MIXER:
                SERVO_RULES.flush();
                if (data.byteLength % 6 === 0) {
                    for (i = 0; i < data.byteLength; i += 6) {
                        SERVO_RULES.put(new ServoMixRule(
                            data.getInt8(i),
                            data.getInt8(i + 1),
                            data.getInt16(i + 2, true),
                            data.getInt8(i + 4),
                            data.getInt8(i + 5)
                        ));
                    }
                }
                SERVO_RULES.cleanup();
                break;

            case MSPCodes.MSP_SET_SERVO_MIX_RULE:
                console.log("Servo mix saved");
                break;
            case MSPCodes.MSP2_ARDUPILOT_SET_SERVO_MIXER:
                console.log("Servo mix saved");
                break;
            case MSPCodes.MSP2_ARDUPILOT_LOGIC_CONDITIONS:
                LOGIC_CONDITIONS.flush();
                if (data.byteLength % 14 === 0) {
                    for (i = 0; i < data.byteLength; i += 14) {
                        LOGIC_CONDITIONS.put(new LogicCondition(
                            data.getInt8(i),
                            data.getInt8(i + 1),
                            data.getUint8(i + 2),
                            data.getUint8(i + 3),
                            data.getInt32(i + 4, true),
                            data.getUint8(i + 8),
                            data.getInt32(i + 9, true),
                            data.getInt8(i + 13)
                        ));
                    }
                }
                
                break;

            case MSPCodes.MSP2_ARDUPILOT_LOGIC_CONDITIONS_STATUS:
                if (data.byteLength % 4 === 0) {
                    let index = 0;
                    for (i = 0; i < data.byteLength; i += 4) {
                        LOGIC_CONDITIONS_STATUS.set(index, data.getInt32(i, true));
                        index++;
                    }
                }
                break;

            case MSPCodes.MSP2_ARDUPILOT_GVAR_STATUS:
                if (data.byteLength % 4 === 0) {
                    let index = 0;
                    for (i = 0; i < data.byteLength; i += 4) {
                        GLOBAL_VARIABLES_STATUS.set(index, data.getInt32(i, true));
                        index++;
                    }
                }
                break;

            case MSPCodes.MSP2_ARDUPILOT_SET_LOGIC_CONDITIONS:
                console.log("Logic conditions saved");
                break;

            case MSPCodes.MSP2_ARDUPILOT_PROGRAMMING_PID:
                PROGRAMMING_PID.flush();
                if (data.byteLength % 19 === 0) {
                    for (i = 0; i < data.byteLength; i += 19) {
                        PROGRAMMING_PID.put(new ProgrammingPid(
                            data.getInt8(i),                // enabled
                            data.getInt8(i + 1),            // setpointType
                            data.getInt32(i + 2, true),     // setpointValue
                            data.getInt8(i + 6),            // measurementType
                            data.getInt32(i + 7, true),     // measurementValue
                            data.getInt16(i + 11, true),    // gainP
                            data.getInt16(i + 13, true),    // gainI
                            data.getInt16(i + 15, true),    // gainD
                            data.getInt16(i + 17, true)     // gainFF
                        ));
                    }
                }
                break;

            case MSPCodes.MSP2_ARDUPILOT_PROGRAMMING_PID_STATUS:
                if (data.byteLength % 4 === 0) {
                    let index = 0;
                    for (i = 0; i < data.byteLength; i += 4) {
                        PROGRAMMING_PID_STATUS.set(index, data.getInt32(i, true));
                        index++;
                    }
                }
                break;

            case MSPCodes.MSP2_ARDUPILOT_SET_PROGRAMMING_PID:
                console.log("Programming PID saved");
                break;

            case MSPCodes.MSP2_COMMON_MOTOR_MIXER:
                MOTOR_RULES.flush();

                if (data.byteLength % 8 === 0) {
                    for (i = 0; i < data.byteLength; i += 8) {
                        var rule = new MotorMixRule(0, 0, 0, 0);

                        rule.fromMsp(
                            data.getUint16(i, true),
                            data.getUint16(i + 2, true),
                            data.getUint16(i + 4, true),
                            data.getUint16(i + 6, true)
                        );

                        MOTOR_RULES.put(rule);
                    }
                }
                MOTOR_RULES.cleanup();

                break;

            case MSPCodes.MSP2_COMMON_SET_MOTOR_MIXER:
                console.log("motor mixer saved");
                break;

            case MSPCodes.MSP_SERVO_CONFIGURATIONS:
                //noinspection JSUndeclaredVariable
                SERVO_CONFIG = []; // empty the array as new data is coming in

                if (data.byteLength % 14 == 0) {
                    for (i = 0; i < data.byteLength; i += 14) {
                        var arr = {
                            'min': data.getInt16(i + 0, true),
                            'max': data.getInt16(i + 2, true),
                            'middle': data.getInt16(i + 4, true),
                            'rate': data.getInt8(i + 6),
                            'indexOfChannelToForward': data.getInt8(i + 9)
                        };
                        data.getUint32(i + 10); // Skip 4 bytes that used to be reversed Sources
                        SERVO_CONFIG.push(arr);
                    }
                }
                break;
            case MSPCodes.MSP_RC_DEADBAND:
                RC_deadband.deadband = data.getUint8(offset++);
                RC_deadband.yaw_deadband = data.getUint8(offset++);
                RC_deadband.alt_hold_deadband = data.getUint8(offset++);
                REVERSIBLE_MOTORS.deadband_throttle = data.getUint16(offset, true);
                break;
            case MSPCodes.MSP_SENSOR_ALIGNMENT:
                SENSOR_ALIGNMENT.align_gyro = data.getUint8(offset++);
                SENSOR_ALIGNMENT.align_acc = data.getUint8(offset++);
                SENSOR_ALIGNMENT.align_mag = data.getUint8(offset++);
                SENSOR_ALIGNMENT.align_opflow = data.getUint8(offset++);
                break;
            case MSPCodes.MSP_SET_RAW_RC:
                break;
            case MSPCodes.MSP_SET_RAW_GPS:
                break;
            case MSPCodes.MSP_SET_PID:
                console.log('PID settings saved');
                break;
            case MSPCodes.MSP2_SET_PID:
                console.log('PID settings saved');
                break;
            case MSPCodes.MSP_SET_RC_TUNING:
                console.log('RC Tuning saved');
                break;
            case MSPCodes.MSP_ACC_CALIBRATION:
                console.log('Accelerometer calibration executed');
                break;
            case MSPCodes.MSP_MAG_CALIBRATION:
                console.log('Mag calibration executed');
                break;
            case MSPCodes.MSP2_ARDUPILOT_OPFLOW_CALIBRATION:
                console.log('Optic flow calibration executed');
                break;
            case MSPCodes.MSP_SET_MISC:
                console.log('MISC Configuration saved');
                break;
            case MSPCodes.MSP_RESET_CONF:
                console.log('Settings Reset');
                break;
            case MSPCodes.MSP_SELECT_SETTING:
                console.log('Profile selected');
                break;
            case MSPCodes.MSP_SET_SERVO_CONFIGURATION:
                console.log('Servo Configuration saved');
                break;
            case MSPCodes.MSP_RTC:
                if (data.length >= 6) {
                    var seconds = data.getInt32(0, true);
                    var millis = data.getUint16(4, true);
                    console.log("RTC received: " + new Date(seconds * 1000 + millis));
                }
                break;
            case MSPCodes.MSP_SET_RTC:
                console.log('RTC set');
                break;
            case MSPCodes.MSP_EEPROM_WRITE:
                console.log('Settings Saved in EEPROM');
                break;
            case MSPCodes.MSP_DEBUGMSG:
                for (var ii = 0; ii < data.byteLength; ii++) {
                    var c = data.readU8();
                    if (c == 0) {
                        // End of message
                        if (debugMsgBuffer.length > 1) {
                            console.log('[DEBUG] ' + debugMsgBuffer);
                            DEBUG_TRACE = (DEBUG_TRACE || '') + debugMsgBuffer;
                        }
                        debugMsgBuffer = '';
                        continue;
                    }
                    debugMsgBuffer += String.fromCharCode(c);
                }
                break;
            case MSPCodes.MSP_DEBUG:
                for (i = 0; i < 4; i++)
                    SENSOR_DATA.debug[i] = data.getInt16((2 * i), 1);
                break;
            case MSPCodes.MSP2_ARDUPILOT_DEBUG:
                for (i = 0; i < 8; i++)
                    SENSOR_DATA.debug[i] = data.getInt32((4 * i), 1);
                break;
            case MSPCodes.MSP_SET_MOTOR:
                console.log('Motor Speeds Updated');
                break;
            // Additional baseflight commands that are not compatible with MultiWii
            case MSPCodes.MSP_UID:
                CONFIG.uid[0] = data.getUint32(0, true);
                CONFIG.uid[1] = data.getUint32(4, true);
                CONFIG.uid[2] = data.getUint32(8, true);
                break;
            case MSPCodes.MSP_ACC_TRIM:
                CONFIG.accelerometerTrims[0] = data.getInt16(0, true); // pitch
                CONFIG.accelerometerTrims[1] = data.getInt16(2, true); // roll
                break;
            case MSPCodes.MSP_SET_ACC_TRIM:
                console.log('Accelerometer trimms saved.');
                break;
            // Additional private MSP for baseflight configurator
            case MSPCodes.MSP_RX_MAP:
                //noinspection JSUndeclaredVariable
                RC_MAP = []; // empty the array as new data is coming in

                for (i = 0; i < data.byteLength; i++) {
                    RC_MAP.push(data.getUint8(i));
                }
                break;
            case MSPCodes.MSP_SET_RX_MAP:
                console.log('RCMAP saved');
                break;
            case MSPCodes.MSP_BF_CONFIG:
                BF_CONFIG.mixerConfiguration = data.getUint8(0);
                BF_CONFIG.features = data.getUint32(1, true);
                BF_CONFIG.serialrx_type = data.getUint8(5);
                BF_CONFIG.board_align_roll = data.getInt16(6, true); // -180 - 360
                BF_CONFIG.board_align_pitch = data.getInt16(8, true); // -180 - 360
                BF_CONFIG.board_align_yaw = data.getInt16(10, true); // -180 - 360
                BF_CONFIG.currentscale = data.getInt16(12, true);
                BF_CONFIG.currentoffset = data.getInt16(14, true);
                break;
            case MSPCodes.MSP_SET_BF_CONFIG:
                console.log('BF_CONFIG saved');
                break;
            case MSPCodes.MSP_SET_REBOOT:
                console.log('Reboot request accepted');
                break;

            //
            // Cleanflight specific
            //

            case MSPCodes.MSP_API_VERSION:
                CONFIG.mspProtocolVersion = data.getUint8(offset++);
                CONFIG.apiVersion = data.getUint8(offset++) + '.' + data.getUint8(offset++) + '.0';
                break;

            case MSPCodes.MSP_FC_VARIANT:
                for (offset = 0; offset < 4; offset++) {
                    identifier += String.fromCharCode(data.getUint8(offset));
                }
                CONFIG.flightControllerIdentifier = identifier;
                break;

            case MSPCodes.MSP_FC_VERSION:
                //CONFIG.flightControllerVersion = data.getUint8(offset++) + '.' + data.getUint8(offset++) + '.' + data.getUint8(offset++);
                break;

            case MSPCodes.MSP_BUILD_INFO:
                var dateLength = 11;

                buff = [];
                for (i = 0; i < dateLength; i++) {
                    buff.push(data.getUint8(offset++));
                }
                buff.push(32); // ascii space

                var timeLength = 8;
                for (i = 0; i < timeLength; i++) {
                    buff.push(data.getUint8(offset++));
                }
                CONFIG.buildInfo = String.fromCharCode.apply(null, buff);
                break;

            case MSPCodes.MSP_BOARD_INFO:
                for (offset = 0; offset < 4; offset++) {
                    identifier += String.fromCharCode(data.getUint8(offset));
                }
                CONFIG.boardIdentifier = identifier;
                CONFIG.boardVersion = data.getUint16(offset, 1);
                offset += 2;
                break;

            case MSPCodes.MSP_SET_CHANNEL_FORWARDING:
                console.log('Channel forwarding saved');
                break;

            case MSPCodes.MSP_CF_SERIAL_CONFIG:
                SERIAL_CONFIG.ports = [];
                var bytesPerPort = 1 + 2 + 4;
                var serialPortCount = data.byteLength / bytesPerPort;

                for (i = 0; i < serialPortCount; i++) {
                    var BAUD_RATES = mspHelper.BAUD_RATES_post1_6_3;

                    var serialPort = {
                        identifier: data.getUint8(offset),
                        functions: mspHelper.serialPortFunctionMaskToFunctions(data.getUint16(offset + 1, true)),
                        msp_baudrate: BAUD_RATES[data.getUint8(offset + 3)],
                        sensors_baudrate: BAUD_RATES[data.getUint8(offset + 4)],
                        telemetry_baudrate: BAUD_RATES[data.getUint8(offset + 5)],
                        blackbox_baudrate: BAUD_RATES[data.getUint8(offset + 6)]
                    };

                    offset += bytesPerPort;
                    SERIAL_CONFIG.ports.push(serialPort);
                }
                break;

            case MSPCodes.MSP2_CF_SERIAL_CONFIG:
                SERIAL_CONFIG.ports = [];
                var bytesPerPort = 1 + 4 + 4;
                var serialPortCount = data.byteLength / bytesPerPort;

                for (i = 0; i < serialPortCount; i++) {
                    var BAUD_RATES = mspHelper.BAUD_RATES_post1_6_3;

                    var serialPort = {
                        identifier: data.getUint8(offset),
                        functions: mspHelper.serialPortFunctionMaskToFunctions(data.getUint32(offset + 1, true)),
                        msp_baudrate: BAUD_RATES[data.getUint8(offset + 5)],
                        sensors_baudrate: BAUD_RATES[data.getUint8(offset + 6)],
                        telemetry_baudrate: BAUD_RATES[data.getUint8(offset + 7)],
                        blackbox_baudrate: BAUD_RATES[data.getUint8(offset + 8)]
                    };

                    offset += bytesPerPort;
                    SERIAL_CONFIG.ports.push(serialPort);
                }
                break;

            case MSPCodes.MSP_SET_CF_SERIAL_CONFIG:
            case MSPCodes.MSP2_SET_CF_SERIAL_CONFIG:
                console.log('Serial config saved');
                break;

            case MSPCodes.MSP_MODE_RANGES:
                //noinspection JSUndeclaredVariable
                MODE_RANGES = []; // empty the array as new data is coming in

                var modeRangeCount = data.byteLength / 4; // 4 bytes per item.

                for (i = 0; offset < data.byteLength && i < modeRangeCount; i++) {
                    var modeRange = {
                        id: data.getUint8(offset++),
                        auxChannelIndex: data.getUint8(offset++),
                        range: {
                            start: 900 + (data.getUint8(offset++) * 25),
                            end: 900 + (data.getUint8(offset++) * 25)
                        }
                    };
                    MODE_RANGES.push(modeRange);
                }
                break;

            case MSPCodes.MSP_ADJUSTMENT_RANGES:
                //noinspection JSUndeclaredVariable
                ADJUSTMENT_RANGES = []; // empty the array as new data is coming in

                var adjustmentRangeCount = data.byteLength / 6; // 6 bytes per item.

                for (i = 0; offset < data.byteLength && i < adjustmentRangeCount; i++) {
                    var adjustmentRange = {
                        slotIndex: data.getUint8(offset++),
                        auxChannelIndex: data.getUint8(offset++),
                        range: {
                            start: 900 + (data.getUint8(offset++) * 25),
                            end: 900 + (data.getUint8(offset++) * 25)
                        },
                        adjustmentFunction: data.getUint8(offset++),
                        auxSwitchChannelIndex: data.getUint8(offset++)
                    };
                    ADJUSTMENT_RANGES.push(adjustmentRange);
                }
                break;

            case MSPCodes.MSP_CHANNEL_FORWARDING:
                for (i = 0; i < data.byteLength && i < SERVO_CONFIG.length; i++) {
                    var channelIndex = data.getUint8(i);
                    if (channelIndex < 255) {
                        SERVO_CONFIG[i].indexOfChannelToForward = channelIndex;
                    } else {
                        SERVO_CONFIG[i].indexOfChannelToForward = undefined;
                    }
                }
                break;

            case MSPCodes.MSP_RX_CONFIG:
                RX_CONFIG.serialrx_provider = data.getUint8(offset);
                offset++;
                RX_CONFIG.maxcheck = data.getUint16(offset, true);
                offset += 2;
                RX_CONFIG.midrc = data.getUint16(offset, true);
                offset += 2;
                RX_CONFIG.mincheck = data.getUint16(offset, true);
                offset += 2;
                RX_CONFIG.spektrum_sat_bind = data.getUint8(offset);
                offset++;
                RX_CONFIG.rx_min_usec = data.getUint16(offset, true);
                offset += 2;
                RX_CONFIG.rx_max_usec = data.getUint16(offset, true);
                offset += 2;
                offset += 4; // 4 null bytes for betaflight compatibility
                RX_CONFIG.spirx_protocol = data.getUint8(offset);
                offset++;
                RX_CONFIG.spirx_id = data.getUint32(offset, true);
                offset += 4;
                RX_CONFIG.spirx_channel_count = data.getUint8(offset);
                offset += 1;
                // unused byte for fpvCamAngleDegrees, for compatiblity with betaflight
                offset += 1;
                RX_CONFIG.receiver_type = data.getUint8(offset);
                offset += 1;
                break;

            case MSPCodes.MSP_FAILSAFE_CONFIG:
                FAILSAFE_CONFIG.failsafe_delay = data.getUint8(offset);
                offset++;
                FAILSAFE_CONFIG.failsafe_off_delay = data.getUint8(offset);
                offset++;
                FAILSAFE_CONFIG.failsafe_throttle = data.getUint16(offset, true);
                offset += 2;
                FAILSAFE_CONFIG.failsafe_kill_switch = data.getUint8(offset);
                offset++;
                FAILSAFE_CONFIG.failsafe_throttle_low_delay = data.getUint16(offset, true);
                offset += 2;
                FAILSAFE_CONFIG.failsafe_procedure = data.getUint8(offset);
                offset++;
                FAILSAFE_CONFIG.failsafe_recovery_delay = data.getUint8(offset);
                offset++;
                FAILSAFE_CONFIG.failsafe_fw_roll_angle = data.getUint16(offset, true);
                offset += 2;
                FAILSAFE_CONFIG.failsafe_fw_pitch_angle = data.getUint16(offset, true);
                offset += 2;
                FAILSAFE_CONFIG.failsafe_fw_yaw_rate = data.getUint16(offset, true);
                offset += 2;
                FAILSAFE_CONFIG.failsafe_stick_motion_threshold = data.getUint16(offset, true);
                offset += 2;
                FAILSAFE_CONFIG.failsafe_min_distance = data.getUint16(offset, true);
                offset += 2;
                FAILSAFE_CONFIG.failsafe_min_distance_procedure = data.getUint8(offset);
                offset++;
                break;

            case MSPCodes.MSP_RXFAIL_CONFIG:
                //noinspection JSUndeclaredVariable
                RXFAIL_CONFIG = []; // empty the array as new data is coming in

                var channelCount = data.byteLength / 3;

                for (i = 0; offset < data.byteLength && i < channelCount; i++, offset++) {
                    var rxfailChannel = {
                        mode: data.getUint8(offset++),
                        value: data.getUint16(offset++, true)
                    };
                    RXFAIL_CONFIG.push(rxfailChannel);
                }
                break;


            case MSPCodes.MSP_LED_STRIP_CONFIG:
                //noinspection JSUndeclaredVariable
                LED_STRIP = [];

                var ledCount = data.byteLength / 4;
                var directionMask,
                    directions,
                    directionLetterIndex,
                    functions,
                    led;

                for (i = 0; offset < data.byteLength && i < ledCount; i++) {

                    if (semver.lt(CONFIG.apiVersion, "1.20.0")) {
                        directionMask = data.getUint16(offset, true);
                        offset += 2;

                        directions = [];
                        for (directionLetterIndex = 0; directionLetterIndex < MSP.ledDirectionLetters.length; directionLetterIndex++) {
                            if (bit_check(directionMask, directionLetterIndex)) {
                                directions.push(MSP.ledDirectionLetters[directionLetterIndex]);
                            }
                        }

                        var functionMask = data.getUint16(offset, 1);
                        offset += 2;

                        functions = [];
                        for (var functionLetterIndex = 0; functionLetterIndex < MSP.ledFunctionLetters.length; functionLetterIndex++) {
                            if (bit_check(functionMask, functionLetterIndex)) {
                                functions.push(MSP.ledFunctionLetters[functionLetterIndex]);
                            }
                        }

                        led = {
                            directions: directions,
                            functions: functions,
                            x: data.getUint8(offset++),
                            y: data.getUint8(offset++),
                            color: data.getUint8(offset++)
                        };

                        LED_STRIP.push(led);
                    } else {
                        var mask = data.getUint32(offset, 1);
                        offset += 4;

                        var functionId = (mask >> 8) & 0xF;

                        functions = [];
                        for (var baseFunctionLetterIndex = 0; baseFunctionLetterIndex < MSP.ledBaseFunctionLetters.length; baseFunctionLetterIndex++) {
                            if (functionId == baseFunctionLetterIndex) {
                                functions.push(MSP.ledBaseFunctionLetters[baseFunctionLetterIndex]);
                                break;
                            }
                        }

                        var overlayMask = (mask >> 12) & 0x3F;
                        for (var overlayLetterIndex = 0; overlayLetterIndex < MSP.ledOverlayLetters.length; overlayLetterIndex++) {
                            if (bit_check(overlayMask, overlayLetterIndex)) {
                                functions.push(MSP.ledOverlayLetters[overlayLetterIndex]);
                            }
                        }

                        directionMask = (mask >> 22) & 0x3F;

                        directions = [];
                        for (directionLetterIndex = 0; directionLetterIndex < MSP.ledDirectionLetters.length; directionLetterIndex++) {
                            if (bit_check(directionMask, directionLetterIndex)) {
                                directions.push(MSP.ledDirectionLetters[directionLetterIndex]);
                            }
                        }
                        led = {
                            y: (mask) & 0xF,
                            x: (mask >> 4) & 0xF,
                            functions: functions,
                            color: (mask >> 18) & 0xF,
                            directions: directions,
                            parameters: (mask >> 28) & 0xF
                        };

                        LED_STRIP.push(led);
                    }
                }
                break;
            case MSPCodes.MSP_SET_LED_STRIP_CONFIG:
                console.log('Led strip config saved');
                break;
            case MSPCodes.MSP_LED_COLORS:

                //noinspection JSUndeclaredVariable
                LED_COLORS = [];

                colorCount = data.byteLength / 4;

                for (i = 0; offset < data.byteLength && i < colorCount; i++) {

                    var h = data.getUint16(offset, true);
                    var s = data.getUint8(offset + 2);
                    var v = data.getUint8(offset + 3);
                    offset += 4;

                    color = {
                        h: h,
                        s: s,
                        v: v
                    };

                    LED_COLORS.push(color);
                }

                break;
            case MSPCodes.MSP_SET_LED_COLORS:
                console.log('Led strip colors saved');
                break;
            case MSPCodes.MSP_LED_STRIP_MODECOLOR:
                //noinspection JSUndeclaredVariable
                LED_MODE_COLORS = [];

                colorCount = data.byteLength / 3;

                for (i = 0; offset < data.byteLength && i < colorCount; i++) {

                    var mode = data.getUint8(offset++);
                    var direction = data.getUint8(offset++);

                    color = data.getUint8(offset++);

                    LED_MODE_COLORS.push({
                        mode: mode,
                        direction: direction,
                        color: color
                    });
                }
                break;
            case MSPCodes.MSP_SET_LED_STRIP_MODECOLOR:
                console.log('Led strip mode colors saved');
                break;

            case MSPCodes.MSP_DATAFLASH_SUMMARY:
                if (data.byteLength >= 13) {
                    flags = data.getUint8(0);
                    DATAFLASH.ready = (flags & 1) != 0;
                    DATAFLASH.supported = (flags & 2) != 0 || DATAFLASH.ready;
                    DATAFLASH.sectors = data.getUint32(1, 1);
                    DATAFLASH.totalSize = data.getUint32(5, 1);
                    DATAFLASH.usedSize = data.getUint32(9, 1);
                } else {
                    // Firmware version too old to support MSP_DATAFLASH_SUMMARY
                    DATAFLASH.ready = false;
                    DATAFLASH.supported = false;
                    DATAFLASH.sectors = 0;
                    DATAFLASH.totalSize = 0;
                    DATAFLASH.usedSize = 0;
                }
                update_dataflash_global();
                break;
            case MSPCodes.MSP_DATAFLASH_READ:
                // No-op, let callback handle it
                break;
            case MSPCodes.MSP_DATAFLASH_ERASE:
                console.log("Data flash erase begun...");
                break;
            case MSPCodes.MSP_SDCARD_SUMMARY:
                flags = data.getUint8(0);

                SDCARD.supported = (flags & 0x01) != 0;
                SDCARD.state = data.getUint8(1);
                SDCARD.filesystemLastError = data.getUint8(2);
                SDCARD.freeSizeKB = data.getUint32(3, true);
                SDCARD.totalSizeKB = data.getUint32(7, true);
                break;
            case MSPCodes.MSP_BLACKBOX_CONFIG:
                BLACKBOX.supported = (data.getUint8(0) & 1) != 0;
                BLACKBOX.blackboxDevice = data.getUint8(1);
                BLACKBOX.blackboxRateNum = data.getUint8(2);
                BLACKBOX.blackboxRateDenom = data.getUint8(3);
                break;
            case MSPCodes.MSP_SET_BLACKBOX_CONFIG:
                console.log("Blackbox config saved");
                break;
            case MSPCodes.MSP_TRANSPONDER_CONFIG:
                TRANSPONDER.supported = (data.getUint8(offset++) & 1) != 0;
                TRANSPONDER.data = [];
                var bytesRemaining = data.byteLength - offset;
                for (i = 0; i < bytesRemaining; i++) {
                    TRANSPONDER.data.push(data.getUint8(offset++));
                }
                break;
            case MSPCodes.MSP_SET_TRANSPONDER_CONFIG:
                console.log("Transponder config saved");
                break;
            case MSPCodes.MSP_VTX_CONFIG:
                VTX_CONFIG.device_type = data.getUint8(offset++);
                if (VTX_CONFIG.device_type != VTX.DEV_UNKNOWN) {
                    VTX_CONFIG.band = data.getUint8(offset++);
                    VTX_CONFIG.channel = data.getUint8(offset++);
                    VTX_CONFIG.power = data.getUint8(offset++);
                    VTX_CONFIG.pitmode = data.getUint8(offset++);
                    // Ignore wether the VTX is ready for now
                    offset++;
                    VTX_CONFIG.low_power_disarm = data.getUint8(offset++);
                }
                break;
            case MSPCodes.MSP_ADVANCED_CONFIG:
                ADVANCED_CONFIG.gyroSyncDenominator = data.getUint8(offset);
                offset++;
                ADVANCED_CONFIG.pidProcessDenom = data.getUint8(offset);
                offset++;
                ADVANCED_CONFIG.useUnsyncedPwm = data.getUint8(offset);
                offset++;
                ADVANCED_CONFIG.motorPwmProtocol = data.getUint8(offset);
                offset++;
                ADVANCED_CONFIG.motorPwmRate = data.getUint16(offset, true);
                offset += 2;
                ADVANCED_CONFIG.servoPwmRate = data.getUint16(offset, true);
                offset += 2;
                ADVANCED_CONFIG.gyroSync = data.getUint8(offset);
                break;

            case MSPCodes.MSP_SET_VTX_CONFIG:
                console.log("VTX config saved");
                break;

            case MSPCodes.MSP_SET_ADVANCED_CONFIG:
                console.log("Advanced config saved");
                break;

            case MSPCodes.MSP_FILTER_CONFIG:
                FILTER_CONFIG.gyroSoftLpfHz = data.getUint8(0);
                FILTER_CONFIG.dtermLpfHz = data.getUint16(1, true);
                FILTER_CONFIG.yawLpfHz = data.getUint16(3, true);

                FILTER_CONFIG.gyroNotchHz1 = data.getUint16(5, true);
                FILTER_CONFIG.gyroNotchCutoff1 = data.getUint16(7, true);
                FILTER_CONFIG.dtermNotchHz = data.getUint16(9, true);
                FILTER_CONFIG.dtermNotchCutoff = data.getUint16(11, true);
                FILTER_CONFIG.gyroNotchHz2 = data.getUint16(13, true);
                FILTER_CONFIG.gyroNotchCutoff2 = data.getUint16(15, true);

                FILTER_CONFIG.accNotchHz = data.getUint16(17, true);
                FILTER_CONFIG.accNotchCutoff = data.getUint16(19, true);
                FILTER_CONFIG.gyroStage2LowpassHz = data.getUint16(21, true);

                break;

            case MSPCodes.MSP_SET_FILTER_CONFIG:
                console.log("Filter config saved");
                break;

            case MSPCodes.MSP_PID_ADVANCED:
                PID_ADVANCED.rollPitchItermIgnoreRate = data.getUint16(0, true);
                PID_ADVANCED.yawItermIgnoreRate = data.getUint16(2, true);
                PID_ADVANCED.yawPLimit = data.getUint16(4, true);
                PID_ADVANCED.dtermSetpointWeight = data.getUint8(9);
                PID_ADVANCED.pidSumLimit = data.getUint16(10, true);
                PID_ADVANCED.axisAccelerationLimitRollPitch = data.getUint16(13, true);
                PID_ADVANCED.axisAccelerationLimitYaw = data.getUint16(15, true);
                break;

            case MSPCodes.MSP_SET_PID_ADVANCED:
                console.log("PID advanced saved");
                break;

            case MSPCodes.MSP_SENSOR_CONFIG:
                SENSOR_CONFIG.accelerometer = data.getUint8(0, true);
                SENSOR_CONFIG.barometer = data.getUint8(1, true);
                SENSOR_CONFIG.magnetometer = data.getUint8(2, true);
                SENSOR_CONFIG.pitot = data.getUint8(3, true);
                SENSOR_CONFIG.rangefinder = data.getUint8(4, true);
                SENSOR_CONFIG.opflow = data.getUint8(5, true);
                break;

            case MSPCodes.MSP_SET_SENSOR_CONFIG:
                console.log("Sensor config saved");
                break;

            case MSPCodes.MSP_ARDUPILOT_PID:
                ARDUPILOT_PID_CONFIG.asynchronousMode = data.getUint8(0);
                ARDUPILOT_PID_CONFIG.accelerometerTaskFrequency = data.getUint16(1, true);
                ARDUPILOT_PID_CONFIG.attitudeTaskFrequency = data.getUint16(3, true);
                ARDUPILOT_PID_CONFIG.magHoldRateLimit = data.getUint8(5);
                ARDUPILOT_PID_CONFIG.magHoldErrorLpfFrequency = data.getUint8(6);
                ARDUPILOT_PID_CONFIG.yawJumpPreventionLimit = data.getUint16(7, true);
                ARDUPILOT_PID_CONFIG.gyroscopeLpf = data.getUint8(9); //buzz
                ARDUPILOT_PID_CONFIG.accSoftLpfHz = data.getUint8(10);
                break;

            case MSPCodes.MSP_SET_ARDUPILOT_PID:
                console.log("MSP_ARDUPILOT_PID saved");
                break;

            case MSPCodes.MSP_NAV_POSHOLD:
                NAV_POSHOLD.userControlMode = data.getUint8(0);
                NAV_POSHOLD.maxSpeed = data.getUint16(1, true);
                NAV_POSHOLD.maxClimbRate = data.getUint16(3, true);
                NAV_POSHOLD.maxManualSpeed = data.getUint16(5, true);
                NAV_POSHOLD.maxManualClimbRate = data.getUint16(7, true);
                NAV_POSHOLD.maxBankAngle = data.getUint8(9);
                NAV_POSHOLD.useThrottleMidForAlthold = data.getUint8(10);
                NAV_POSHOLD.hoverThrottle = data.getUint16(11, true);
                break;

            case MSPCodes.MSP_SET_NAV_POSHOLD:
                console.log('NAV_POSHOLD saved');
                break;

            case MSPCodes.MSP_CALIBRATION_DATA:
                var callibrations = data.getUint8(0);
                CALIBRATION_DATA.acc.Pos0 = (1 & (callibrations >> 0));
                CALIBRATION_DATA.acc.Pos1 = (1 & (callibrations >> 1));
                CALIBRATION_DATA.acc.Pos2 = (1 & (callibrations >> 2));
                CALIBRATION_DATA.acc.Pos3 = (1 & (callibrations >> 3));
                CALIBRATION_DATA.acc.Pos4 = (1 & (callibrations >> 4));
                CALIBRATION_DATA.acc.Pos5 = (1 & (callibrations >> 5));

                CALIBRATION_DATA.accZero.X = data.getInt16(1, true);
                CALIBRATION_DATA.accZero.Y = data.getInt16(3, true);
                CALIBRATION_DATA.accZero.Z = data.getInt16(5, true);
                CALIBRATION_DATA.accGain.X = data.getInt16(7, true);
                CALIBRATION_DATA.accGain.Y = data.getInt16(9, true);
                CALIBRATION_DATA.accGain.Z = data.getInt16(11, true);
                CALIBRATION_DATA.magZero.X = data.getInt16(13, true);
                CALIBRATION_DATA.magZero.Y = data.getInt16(15, true);
                CALIBRATION_DATA.magZero.Z = data.getInt16(17, true);
                CALIBRATION_DATA.opflow.Scale = (data.getInt16(19, true) / 256.0);
                
                //if (semver.gte(CONFIG.flightControllerVersion, "2.6.0")) {
                    CALIBRATION_DATA.magGain.X = data.getInt16(21, true);
                    CALIBRATION_DATA.magGain.Y = data.getInt16(23, true);
                    CALIBRATION_DATA.magGain.Z = data.getInt16(25, true);
                //}

                break;

            case MSPCodes.MSP_SET_CALIBRATION_DATA:
                console.log('Calibration data saved');
                break;

            case MSPCodes.MSP_POSITION_ESTIMATION_CONFIG:
                POSITION_ESTIMATOR.w_z_baro_p = data.getUint16(0, true) / 100;
                POSITION_ESTIMATOR.w_z_gps_p = data.getUint16(2, true) / 100;
                POSITION_ESTIMATOR.w_z_gps_v = data.getUint16(4, true) / 100;
                POSITION_ESTIMATOR.w_xy_gps_p = data.getUint16(6, true) / 100;
                POSITION_ESTIMATOR.w_xy_gps_v = data.getUint16(8, true) / 100;
                POSITION_ESTIMATOR.gps_min_sats = data.getUint8(10);
                POSITION_ESTIMATOR.use_gps_velned = data.getUint8(11);
                break;

            case MSPCodes.MSP_SET_POSITION_ESTIMATION_CONFIG:
                console.log('POSITION_ESTIMATOR saved');
                break;

            case MSPCodes.MSP_RTH_AND_LAND_CONFIG:
                RTH_AND_LAND_CONFIG.minRthDistance = data.getUint16(0, true);
                RTH_AND_LAND_CONFIG.rthClimbFirst = data.getUint8(2);
                RTH_AND_LAND_CONFIG.rthClimbIgnoreEmergency = data.getUint8(3);
                RTH_AND_LAND_CONFIG.rthTailFirst = data.getUint8(4);
                RTH_AND_LAND_CONFIG.rthAllowLanding = data.getUint8(5);
                RTH_AND_LAND_CONFIG.rthAltControlMode = data.getUint8(6);
                RTH_AND_LAND_CONFIG.rthAbortThreshold = data.getUint16(7, true);
                RTH_AND_LAND_CONFIG.rthAltitude = data.getUint16(9, true);
                RTH_AND_LAND_CONFIG.landMinAltVspd = data.getUint16(11, true);
                RTH_AND_LAND_CONFIG.landMaxAltVspd = data.getUint16(13, true);
                RTH_AND_LAND_CONFIG.landSlowdownMinAlt = data.getUint16(15, true);
                RTH_AND_LAND_CONFIG.landSlowdownMaxAlt = data.getUint16(17, true);
                RTH_AND_LAND_CONFIG.emergencyDescentRate = data.getUint16(19, true);
                break;

            case MSPCodes.MSP_SET_RTH_AND_LAND_CONFIG:
                console.log('RTH_AND_LAND_CONFIG saved');
                break;

            case MSPCodes.MSP_FW_CONFIG:
                FW_CONFIG.cruiseThrottle = data.getUint16(0, true);
                FW_CONFIG.minThrottle = data.getUint16(2, true);
                FW_CONFIG.maxThrottle = data.getUint16(4, true);
                FW_CONFIG.maxBankAngle = data.getUint8(6);
                FW_CONFIG.maxClimbAngle = data.getUint8(7);
                FW_CONFIG.maxDiveAngle = data.getUint8(8);
                FW_CONFIG.pitchToThrottle = data.getUint8(9);
                FW_CONFIG.loiterRadius = data.getUint16(10, true);
                break;

            case MSPCodes.MSP_SET_FW_CONFIG:
                console.log('FW_CONFIG saved');
                break;

            case MSPCodes.MSP_SET_MODE_RANGE:
                console.log('Mode range saved');
                break;
            case MSPCodes.MSP_SET_ADJUSTMENT_RANGE:
                console.log('Adjustment range saved');
                break;
            case MSPCodes.MSP_SET_LOOP_TIME:
                console.log('Looptime saved');
                break;
            case MSPCodes.MSP_SET_ARMING_CONFIG:
                console.log('Arming config saved');
                break;
            case MSPCodes.MSP_SET_RESET_CURR_PID:
                console.log('Current PID profile reset');
                break;
            case MSPCodes.MSP_SET_3D:
                console.log('3D settings saved');
                break;
            case MSPCodes.MSP_SET_RC_DEADBAND:
                console.log('Rc controls settings saved');
                break;
            case MSPCodes.MSP_SET_SENSOR_ALIGNMENT:
                console.log('Sensor alignment saved');
                break;
            case MSPCodes.MSP_SET_RX_CONFIG:
                console.log('Rx config saved');
                break;
            case MSPCodes.MSP_SET_RXFAIL_CONFIG:
                console.log('Rxfail config saved');
                break;
            case MSPCodes.MSP_SET_FAILSAFE_CONFIG:
                console.log('Failsafe config saved');
                break;
            case MSPCodes.MSP_OSD_CONFIG:
                break;
            case MSPCodes.MSP_SET_OSD_CONFIG:
                console.log('OSD config set');
                break;
            case MSPCodes.MSP_OSD_CHAR_READ:
                break;
            case MSPCodes.MSP_OSD_CHAR_WRITE:
                console.log('OSD char uploaded');
                break;
            case MSPCodes.MSP_NAME:
                CONFIG.name = '';
                var char;
                while ((char = data.readU8()) !== null) {
                    CONFIG.name += String.fromCharCode(char);
                }
                break;
            case MSPCodes.MSP_SET_NAME:
                console.log("Craft name set");
                break;
            case MSPCodes.MSPV2_SETTING:
                break;
            case MSPCodes.MSP2_COMMON_SETTING_INFO:
                break;
            case MSPCodes.MSPV2_SET_SETTING:
                console.log("Setting set");
                break;
            case MSPCodes.MSP_WP_GETINFO:
                // Reserved for waypoint capabilities data.getUint8(0);
                MISSION_PLANER.setMaxWaypoints(data.getUint8(1));
                MISSION_PLANER.setValidMission(data.getUint8(2));
                MISSION_PLANER.setCountBusyPoints(data.getUint8(3));
                break;
            case MSPCodes.MSP_SET_WP:
                console.log('Point saved');
                break;
            case MSPCodes.MSP_WP_MISSION_SAVE:
                // buffer.push(0);
                console.log(data);
                break;
            case MSPCodes.MSP_WP_MISSION_LOAD:
                console.log('Mission load');
                break;
            case MSPCodes.MSP2_ARDUPILOT_MIXER:
                MIXER_CONFIG.yawMotorDirection = data.getInt8(0);
                MIXER_CONFIG.yawJumpPreventionLimit = data.getUint16(1, true);
                //MIXER_CONFIG.platformType = data.getInt8(3);
                MIXER_CONFIG.hasFlaps = data.getInt8(4);
                MIXER_CONFIG.appliedMixerPreset = data.getInt16(5, true);
                MIXER_CONFIG.numberOfMotors = data.getInt8(7);
                MIXER_CONFIG.numberOfServos = data.getInt8(8);
                MOTOR_RULES.setMotorCount(MIXER_CONFIG.numberOfMotors);
                SERVO_RULES.setServoCount(MIXER_CONFIG.numberOfServos);
                break;
            case MSPCodes.MSP2_ARDUPILOT_SET_MIXER:
                console.log('Mixer config saved');
            case MSPCodes.MSP2_ARDUPILOT_OSD_LAYOUTS:
                break;
            case MSPCodes.MSP2_ARDUPILOT_OSD_SET_LAYOUT_ITEM:
                console.log('OSD layout item saved');
                break;
            case MSPCodes.MSP2_ARDUPILOT_OSD_ALARMS:
                break;
            case MSPCodes.MSP2_ARDUPILOT_OSD_SET_ALARMS:
                console.log('OSD alarms saved');
                break;
            case MSPCodes.MSP2_ARDUPILOT_OSD_PREFERENCES:
                break;
            case MSPCodes.MSP2_ARDUPILOT_OSD_SET_PREFERENCES:
                console.log('OSD preferences saved');
                break;
            case MSPCodes.MSPV2_ARDUPILOT_OUTPUT_MAPPING:
                OUTPUT_MAPPING.flush();
                for (i = 0; i < data.byteLength; ++i)
                    OUTPUT_MAPPING.put(data.getUint8(i));
                break;

            case MSPCodes.MSP2_ARDUPILOT_MC_BRAKING:
                try {
                    BRAKING_CONFIG.speedThreshold = data.getUint16(0, true);
                    BRAKING_CONFIG.disengageSpeed = data.getUint16(2, true);
                    BRAKING_CONFIG.timeout = data.getUint16(4, true);
                    BRAKING_CONFIG.boostFactor = data.getInt8(6);
                    BRAKING_CONFIG.boostTimeout = data.getUint16(7, true);
                    BRAKING_CONFIG.boostSpeedThreshold = data.getUint16(9, true);
                    BRAKING_CONFIG.boostDisengageSpeed = data.getUint16(11, true);
                    BRAKING_CONFIG.bankAngle = data.getInt8(13);
                } catch (e) {
                    console.log("MC_BRAKING MODE is not supported by the hardware");
                }
                break;

            case MSPCodes.MSP2_ARDUPILOT_SET_MC_BRAKING:
                console.log('Braking config saved');
                break;
            case MSPCodes.MSP2_BLACKBOX_CONFIG:
                BLACKBOX.supported = (data.getUint8(0) & 1) != 0;
                BLACKBOX.blackboxDevice = data.getUint8(1);
                BLACKBOX.blackboxRateNum = data.getUint16(2);
                BLACKBOX.blackboxRateDenom = data.getUint16(4);
                break;
            case MSPCodes.MSP2_SET_BLACKBOX_CONFIG:
                console.log("Blackbox config saved");
                break;

            case MSPCodes.MSP2_ARDUPILOT_TEMPERATURES:
                for (i = 0; i < 8; ++i) {
                    temp_decidegrees = data.getInt16(i * 2, true);
                    SENSOR_DATA.temperature[i] = temp_decidegrees / 10; // °C
                }
                break;
            case MSPCodes.MSP2_ARDUPILOT_SAFEHOME:
                SAFEHOMES.put(new Safehome(
                    data.getUint8(0),
                    data.getUint8(1),
                    data.getInt32(2, true),
                    data.getInt32(6, true)
                ));
                break;
            case MSPCodes.MSP2_ARDUPILOT_SET_SAFEHOME:
                console.log('Safehome points saved');
                break;    
            
            default:
                console.log('Unknown code detected: ' + dataHandler.code);
        } else {
            console.log('FC reports unsupported message error: ' + dataHandler.code);
        }

        // trigger callbacks, cleanup/remove callback after trigger
        for (i = dataHandler.callbacks.length - 1; i >= 0; i--) { // iterating in reverse because we use .splice which modifies array length
            if (i < dataHandler.callbacks.length) {
                if (dataHandler.callbacks[i].code == dataHandler.code) {
                    // save callback reference
                    var callback = dataHandler.callbacks[i].onFinish;

                    // remove timeout
                    clearTimeout(dataHandler.callbacks[i].timer);

                    /*
                     * Compute roundtrip
                     */
                    if (dataHandler.callbacks[i]) {
                        helper.mspQueue.putRoundtrip(new Date().getTime() - dataHandler.callbacks[i].createdOn);
                        helper.mspQueue.putHardwareRoundtrip(new Date().getTime() - dataHandler.callbacks[i].sentOn);
                    }

                    // remove object from array
                    dataHandler.callbacks.splice(i, 1);

                    // fire callback
                    if (callback) {
                        callback({'command': dataHandler.code, 'data': data, 'length': dataHandler.message_length_expected});
                    }
                    break;
                }
            }
        }
    };

    self.crunch = function (code) {
        var buffer = [],
            i;

        switch (code) {
            case MSPCodes.MSP_SET_BF_CONFIG:
                buffer.push(BF_CONFIG.mixerConfiguration);
                buffer.push(specificByte(BF_CONFIG.features, 0));
                buffer.push(specificByte(BF_CONFIG.features, 1));
                buffer.push(specificByte(BF_CONFIG.features, 2));
                buffer.push(specificByte(BF_CONFIG.features, 3));
                buffer.push(BF_CONFIG.serialrx_type);
                buffer.push(specificByte(BF_CONFIG.board_align_roll, 0));
                buffer.push(specificByte(BF_CONFIG.board_align_roll, 1));
                buffer.push(specificByte(BF_CONFIG.board_align_pitch, 0));
                buffer.push(specificByte(BF_CONFIG.board_align_pitch, 1));
                buffer.push(specificByte(BF_CONFIG.board_align_yaw, 0));
                buffer.push(specificByte(BF_CONFIG.board_align_yaw, 1));
                buffer.push(lowByte(BF_CONFIG.currentscale));
                buffer.push(highByte(BF_CONFIG.currentscale));
                buffer.push(lowByte(BF_CONFIG.currentoffset));
                buffer.push(highByte(BF_CONFIG.currentoffset));
                break;
            case MSPCodes.MSP_SET_VTX_CONFIG:
                if (VTX_CONFIG.band > 0) {
                    buffer.push16(((VTX_CONFIG.band - 1) * 8) + (VTX_CONFIG.channel - 1));
                } else {
                    // This tells the firmware to ignore this value.
                    buffer.push16(VTX.MAX_FREQUENCY_MHZ + 1);
                }
                buffer.push(VTX_CONFIG.power);
                // Don't enable PIT mode
                buffer.push(0);
                buffer.push(VTX_CONFIG.low_power_disarm);
                break;
            case MSPCodes.MSP_SET_PID:
                for (i = 0; i < PIDs.length; i++) {
                    buffer.push(parseInt(PIDs[i][0]));
                    buffer.push(parseInt(PIDs[i][1]));
                    buffer.push(parseInt(PIDs[i][2]));
                }
                break;
            case MSPCodes.MSP2_SET_PID:
                for (i = 0; i < PIDs.length; i++) {
                    buffer.push(parseInt(PIDs[i][0]));
                    buffer.push(parseInt(PIDs[i][1]));
                    buffer.push(parseInt(PIDs[i][2]));
                    buffer.push(parseInt(PIDs[i][3]));
                }
                break;
            case MSPCodes.MSP_SET_RC_TUNING:
                buffer.push(Math.round(RC_tuning.RC_RATE * 100));
                buffer.push(Math.round(RC_tuning.RC_EXPO * 100));
                buffer.push(Math.round(RC_tuning.roll_rate / 10));
                buffer.push(Math.round(RC_tuning.pitch_rate / 10));
                buffer.push(Math.round(RC_tuning.yaw_rate / 10));
                buffer.push(RC_tuning.dynamic_THR_PID);
                buffer.push(Math.round(RC_tuning.throttle_MID * 100));
                buffer.push(Math.round(RC_tuning.throttle_EXPO * 100));
                buffer.push(lowByte(RC_tuning.dynamic_THR_breakpoint));
                buffer.push(highByte(RC_tuning.dynamic_THR_breakpoint));
                buffer.push(Math.round(RC_tuning.RC_YAW_EXPO * 100));
                break;
            case MSPCodes.MSPV2_ARDUPILOT_SET_RATE_PROFILE:
                // throttle
                buffer.push(Math.round(RC_tuning.throttle_MID * 100));
                buffer.push(Math.round(RC_tuning.throttle_EXPO * 100));
                buffer.push(RC_tuning.dynamic_THR_PID);
                buffer.push(lowByte(RC_tuning.dynamic_THR_breakpoint));
                buffer.push(highByte(RC_tuning.dynamic_THR_breakpoint));

                // stabilized
                buffer.push(Math.round(RC_tuning.RC_EXPO * 100));
                buffer.push(Math.round(RC_tuning.RC_YAW_EXPO * 100));
                buffer.push(Math.round(RC_tuning.roll_rate / 10));
                buffer.push(Math.round(RC_tuning.pitch_rate / 10));
                buffer.push(Math.round(RC_tuning.yaw_rate / 10));

                // manual
                buffer.push(Math.round(RC_tuning.manual_RC_EXPO * 100));
                buffer.push(Math.round(RC_tuning.manual_RC_YAW_EXPO * 100));
                buffer.push(RC_tuning.manual_roll_rate);
                buffer.push(RC_tuning.manual_pitch_rate);
                buffer.push(RC_tuning.manual_yaw_rate);
                break;

            case MSPCodes.MSP_SET_RX_MAP:
                for (i = 0; i < RC_MAP.length; i++) {
                    buffer.push(RC_MAP[i]);
                }
                break;
            case MSPCodes.MSP_SET_ACC_TRIM:
                buffer.push(lowByte(CONFIG.accelerometerTrims[0]));
                buffer.push(highByte(CONFIG.accelerometerTrims[0]));
                buffer.push(lowByte(CONFIG.accelerometerTrims[1]));
                buffer.push(highByte(CONFIG.accelerometerTrims[1]));
                break;
            case MSPCodes.MSP_SET_ARMING_CONFIG:
                buffer.push(ARMING_CONFIG.auto_disarm_delay);
                buffer.push(ARMING_CONFIG.disarm_kill_switch);
                break;
            case MSPCodes.MSP_SET_LOOP_TIME:
                buffer.push(lowByte(FC_CONFIG.loopTime));
                buffer.push(highByte(FC_CONFIG.loopTime));
                break;
            case MSPCodes.MSP_SET_MISC:
                buffer.push(lowByte(MISC.midrc));
                buffer.push(highByte(MISC.midrc));
                buffer.push(lowByte(MISC.minthrottle));
                buffer.push(highByte(MISC.minthrottle));
                buffer.push(lowByte(MISC.maxthrottle));
                buffer.push(highByte(MISC.maxthrottle));
                buffer.push(lowByte(MISC.mincommand));
                buffer.push(highByte(MISC.mincommand));
                buffer.push(lowByte(MISC.failsafe_throttle));
                buffer.push(highByte(MISC.failsafe_throttle));
                buffer.push(MISC.gps_type);
                buffer.push(MISC.sensors_baudrate);
                buffer.push(MISC.gps_ubx_sbas);
                buffer.push(MISC.multiwiicurrentoutput);
                buffer.push(MISC.rssi_channel);
                buffer.push(MISC.placeholder2);
                buffer.push(lowByte(Math.round(MISC.mag_declination * 10)));
                buffer.push(highByte(Math.round(MISC.mag_declination * 10)));
                buffer.push(MISC.vbatscale);
                buffer.push(Math.round(MISC.vbatmincellvoltage * 10));
                buffer.push(Math.round(MISC.vbatmaxcellvoltage * 10));
                buffer.push(Math.round(MISC.vbatwarningcellvoltage * 10));
                break;
            case MSPCodes.MSPV2_ARDUPILOT_SET_MISC:
                buffer.push(lowByte(MISC.midrc));
                buffer.push(highByte(MISC.midrc));
                buffer.push(lowByte(MISC.minthrottle));
                buffer.push(highByte(MISC.minthrottle));
                buffer.push(lowByte(MISC.maxthrottle));
                buffer.push(highByte(MISC.maxthrottle));
                buffer.push(lowByte(MISC.mincommand));
                buffer.push(highByte(MISC.mincommand));
                buffer.push(lowByte(MISC.failsafe_throttle));
                buffer.push(highByte(MISC.failsafe_throttle));
                buffer.push(MISC.gps_type);
                buffer.push(MISC.sensors_baudrate);
                buffer.push(MISC.gps_ubx_sbas);
                buffer.push(MISC.rssi_channel);
                buffer.push(lowByte(Math.round(MISC.mag_declination * 10)));
                buffer.push(highByte(Math.round(MISC.mag_declination * 10)));
                buffer.push(lowByte(MISC.vbatscale));
                buffer.push(highByte(MISC.vbatscale));
                buffer.push(MISC.voltage_source);
                buffer.push(MISC.battery_cells);
                buffer.push(lowByte(Math.round(MISC.vbatdetectcellvoltage * 100)));
                buffer.push(highByte(Math.round(MISC.vbatdetectcellvoltage * 100)));
                buffer.push(lowByte(Math.round(MISC.vbatmincellvoltage * 100)));
                buffer.push(highByte(Math.round(MISC.vbatmincellvoltage * 100)));
                buffer.push(lowByte(Math.round(MISC.vbatmaxcellvoltage * 100)));
                buffer.push(highByte(Math.round(MISC.vbatmaxcellvoltage * 100)));
                buffer.push(lowByte(Math.round(MISC.vbatwarningcellvoltage * 100)));
                buffer.push(highByte(Math.round(MISC.vbatwarningcellvoltage * 100)));
                for (byte_index = 0; byte_index < 4; ++byte_index)
                    buffer.push(specificByte(MISC.battery_capacity, byte_index));
                for (byte_index = 0; byte_index < 4; ++byte_index)
                    buffer.push(specificByte(MISC.battery_capacity_warning, byte_index));
                for (byte_index = 0; byte_index < 4; ++byte_index)
                    buffer.push(specificByte(MISC.battery_capacity_critical, byte_index));
                buffer.push((MISC.battery_capacity_unit == 'mAh') ? 0 : 1);
                break;
            case MSPCodes.MSPV2_ARDUPILOT_SET_BATTERY_CONFIG:
                buffer.push(lowByte(BATTERY_CONFIG.vbatscale));
                buffer.push(highByte(BATTERY_CONFIG.vbatscale));
                buffer.push(BATTERY_CONFIG.voltage_source);
                buffer.push(BATTERY_CONFIG.battery_cells);
                buffer.push(lowByte(Math.round(BATTERY_CONFIG.vbatdetectcellvoltage * 100)));
                buffer.push(highByte(Math.round(BATTERY_CONFIG.vbatdetectcellvoltage * 100)));
                buffer.push(lowByte(Math.round(BATTERY_CONFIG.vbatmincellvoltage * 100)));
                buffer.push(highByte(Math.round(BATTERY_CONFIG.vbatmincellvoltage * 100)));
                buffer.push(lowByte(Math.round(BATTERY_CONFIG.vbatmaxcellvoltage * 100)));
                buffer.push(highByte(Math.round(BATTERY_CONFIG.vbatmaxcellvoltage * 100)));
                buffer.push(lowByte(Math.round(BATTERY_CONFIG.vbatwarningcellvoltage * 100)));
                buffer.push(highByte(Math.round(BATTERY_CONFIG.vbatwarningcellvoltage * 100)));
                buffer.push(lowByte(BATTERY_CONFIG.current_offset));
                buffer.push(highByte(BATTERY_CONFIG.current_offset));
                buffer.push(lowByte(BATTERY_CONFIG.current_scale));
                buffer.push(highByte(BATTERY_CONFIG.current_scale));
                for (byte_index = 0; byte_index < 4; ++byte_index)
                    buffer.push(specificByte(BATTERY_CONFIG.capacity, byte_index));
                for (byte_index = 0; byte_index < 4; ++byte_index)
                    buffer.push(specificByte(BATTERY_CONFIG.capacity_warning, byte_index));
                for (byte_index = 0; byte_index < 4; ++byte_index)
                    buffer.push(specificByte(BATTERY_CONFIG.capacity_critical, byte_index));
                buffer.push(BATTERY_CONFIG.capacity_unit);
                break;

            case MSPCodes.MSP_SET_RX_CONFIG:
                buffer.push(RX_CONFIG.serialrx_provider);
                buffer.push(lowByte(RX_CONFIG.maxcheck));
                buffer.push(highByte(RX_CONFIG.maxcheck));
                buffer.push(lowByte(RX_CONFIG.midrc));
                buffer.push(highByte(RX_CONFIG.midrc));
                buffer.push(lowByte(RX_CONFIG.mincheck));
                buffer.push(highByte(RX_CONFIG.mincheck));
                buffer.push(RX_CONFIG.spektrum_sat_bind);
                buffer.push(lowByte(RX_CONFIG.rx_min_usec));
                buffer.push(highByte(RX_CONFIG.rx_min_usec));
                buffer.push(lowByte(RX_CONFIG.rx_max_usec));
                buffer.push(highByte(RX_CONFIG.rx_max_usec));
                buffer.push(0); // 4 null bytes for betaflight compatibility
                buffer.push(0);
                buffer.push(0);
                buffer.push(0);
                buffer.push(RX_CONFIG.spirx_protocol);
                // spirx_id - 4 bytes
                buffer.push32(RX_CONFIG.spirx_id);
                buffer.push(RX_CONFIG.spirx_channel_count);
                // unused byte for fpvCamAngleDegrees, for compatiblity with betaflight
                buffer.push(0);
                // receiver type in RX_CONFIG rather than in BF_CONFIG.features
                buffer.push(RX_CONFIG.receiver_type);
                break;

            case MSPCodes.MSP_SET_FAILSAFE_CONFIG:
                buffer.push(FAILSAFE_CONFIG.failsafe_delay);
                buffer.push(FAILSAFE_CONFIG.failsafe_off_delay);
                buffer.push(lowByte(FAILSAFE_CONFIG.failsafe_throttle));
                buffer.push(highByte(FAILSAFE_CONFIG.failsafe_throttle));
                buffer.push(FAILSAFE_CONFIG.failsafe_kill_switch);
                buffer.push(lowByte(FAILSAFE_CONFIG.failsafe_throttle_low_delay));
                buffer.push(highByte(FAILSAFE_CONFIG.failsafe_throttle_low_delay));
                buffer.push(FAILSAFE_CONFIG.failsafe_procedure);
                buffer.push(FAILSAFE_CONFIG.failsafe_recovery_delay);
                buffer.push(lowByte(FAILSAFE_CONFIG.failsafe_fw_roll_angle));
                buffer.push(highByte(FAILSAFE_CONFIG.failsafe_fw_roll_angle));
                buffer.push(lowByte(FAILSAFE_CONFIG.failsafe_fw_pitch_angle));
                buffer.push(highByte(FAILSAFE_CONFIG.failsafe_fw_pitch_angle));
                buffer.push(lowByte(FAILSAFE_CONFIG.failsafe_fw_yaw_rate));
                buffer.push(highByte(FAILSAFE_CONFIG.failsafe_fw_yaw_rate));
                buffer.push(lowByte(FAILSAFE_CONFIG.failsafe_stick_motion_threshold));
                buffer.push(highByte(FAILSAFE_CONFIG.failsafe_stick_motion_threshold));
                buffer.push(lowByte(FAILSAFE_CONFIG.failsafe_min_distance));
                buffer.push(highByte(FAILSAFE_CONFIG.failsafe_min_distance));
                buffer.push(FAILSAFE_CONFIG.failsafe_min_distance_procedure);
                break;

            case MSPCodes.MSP_SET_TRANSPONDER_CONFIG:
                for (i = 0; i < TRANSPONDER.data.length; i++) {
                    buffer.push(TRANSPONDER.data[i]);
                }
                break;

            case MSPCodes.MSP_SET_CHANNEL_FORWARDING:
                for (i = 0; i < SERVO_CONFIG.length; i++) {
                    var out = SERVO_CONFIG[i].indexOfChannelToForward;
                    if (out == undefined) {
                        out = 255; // Cleanflight defines "CHANNEL_FORWARDING_DISABLED" as "(uint8_t)0xFF"
                    }
                    buffer.push(out);
                }
                break;

            case MSPCodes.MSP_SET_CF_SERIAL_CONFIG:
                for (i = 0; i < SERIAL_CONFIG.ports.length; i++) {
                    var serialPort = SERIAL_CONFIG.ports[i];

                    buffer.push(serialPort.identifier);

                    var functionMask = mspHelper.SERIAL_PORT_FUNCTIONSToMask(serialPort.functions);
                    buffer.push(specificByte(functionMask, 0));
                    buffer.push(specificByte(functionMask, 1));

                    var BAUD_RATES = mspHelper.BAUD_RATES_post1_6_3;
                    buffer.push(BAUD_RATES.indexOf(serialPort.msp_baudrate));
                    buffer.push(BAUD_RATES.indexOf(serialPort.sensors_baudrate));
                    buffer.push(BAUD_RATES.indexOf(serialPort.telemetry_baudrate));
                    buffer.push(BAUD_RATES.indexOf(serialPort.blackbox_baudrate));
                }
                break;

            case MSPCodes.MSP2_SET_CF_SERIAL_CONFIG:
                for (i = 0; i < SERIAL_CONFIG.ports.length; i++) {
                    var serialPort = SERIAL_CONFIG.ports[i];

                    buffer.push(serialPort.identifier);

                    var functionMask = mspHelper.SERIAL_PORT_FUNCTIONSToMask(serialPort.functions);
                    buffer.push(specificByte(functionMask, 0));
                    buffer.push(specificByte(functionMask, 1));
                    buffer.push(specificByte(functionMask, 2));
                    buffer.push(specificByte(functionMask, 3));

                    var BAUD_RATES = mspHelper.BAUD_RATES_post1_6_3;
                    buffer.push(BAUD_RATES.indexOf(serialPort.msp_baudrate));
                    buffer.push(BAUD_RATES.indexOf(serialPort.sensors_baudrate));
                    buffer.push(BAUD_RATES.indexOf(serialPort.telemetry_baudrate));
                    buffer.push(BAUD_RATES.indexOf(serialPort.blackbox_baudrate));
                }
                break;

            case MSPCodes.MSP_SET_3D:
                buffer.push(lowByte(REVERSIBLE_MOTORS.deadband_low));
                buffer.push(highByte(REVERSIBLE_MOTORS.deadband_low));
                buffer.push(lowByte(REVERSIBLE_MOTORS.deadband_high));
                buffer.push(highByte(REVERSIBLE_MOTORS.deadband_high));
                buffer.push(lowByte(REVERSIBLE_MOTORS.neutral));
                buffer.push(highByte(REVERSIBLE_MOTORS.neutral));
                break;

            case MSPCodes.MSP_SET_RC_DEADBAND:
                buffer.push(RC_deadband.deadband);
                buffer.push(RC_deadband.yaw_deadband);
                buffer.push(RC_deadband.alt_hold_deadband);
                buffer.push(lowByte(REVERSIBLE_MOTORS.deadband_throttle));
                buffer.push(highByte(REVERSIBLE_MOTORS.deadband_throttle));
                break;

            case MSPCodes.MSP_SET_SENSOR_ALIGNMENT:
                buffer.push(SENSOR_ALIGNMENT.align_gyro);
                buffer.push(SENSOR_ALIGNMENT.align_acc);
                buffer.push(SENSOR_ALIGNMENT.align_mag);
                buffer.push(SENSOR_ALIGNMENT.align_opflow);
                break;

            case MSPCodes.MSP_SET_ADVANCED_CONFIG:
                buffer.push(ADVANCED_CONFIG.gyroSyncDenominator);
                buffer.push(ADVANCED_CONFIG.pidProcessDenom);
                buffer.push(ADVANCED_CONFIG.useUnsyncedPwm);
                buffer.push(ADVANCED_CONFIG.motorPwmProtocol);

                buffer.push(lowByte(ADVANCED_CONFIG.motorPwmRate));
                buffer.push(highByte(ADVANCED_CONFIG.motorPwmRate));

                buffer.push(lowByte(ADVANCED_CONFIG.servoPwmRate));
                buffer.push(highByte(ADVANCED_CONFIG.servoPwmRate));

                buffer.push(ADVANCED_CONFIG.gyroSync);
                break;

            case MSPCodes.MSP_SET_ARDUPILOT_PID:
                buffer.push(ARDUPILOT_PID_CONFIG.asynchronousMode);

                buffer.push(lowByte(ARDUPILOT_PID_CONFIG.accelerometerTaskFrequency));
                buffer.push(highByte(ARDUPILOT_PID_CONFIG.accelerometerTaskFrequency));

                buffer.push(lowByte(ARDUPILOT_PID_CONFIG.attitudeTaskFrequency));
                buffer.push(highByte(ARDUPILOT_PID_CONFIG.attitudeTaskFrequency));

                buffer.push(ARDUPILOT_PID_CONFIG.magHoldRateLimit);
                buffer.push(ARDUPILOT_PID_CONFIG.magHoldErrorLpfFrequency);

                buffer.push(lowByte(ARDUPILOT_PID_CONFIG.yawJumpPreventionLimit));
                buffer.push(highByte(ARDUPILOT_PID_CONFIG.yawJumpPreventionLimit));

                buffer.push(ARDUPILOT_PID_CONFIG.gyroscopeLpf);
                buffer.push(ARDUPILOT_PID_CONFIG.accSoftLpfHz);

                buffer.push(0); //reserved
                buffer.push(0); //reserved
                buffer.push(0); //reserved
                buffer.push(0); //reserved
                break;

            case MSPCodes.MSP_SET_NAV_POSHOLD:
                buffer.push(NAV_POSHOLD.userControlMode);

                buffer.push(lowByte(NAV_POSHOLD.maxSpeed));
                buffer.push(highByte(NAV_POSHOLD.maxSpeed));

                buffer.push(lowByte(NAV_POSHOLD.maxClimbRate));
                buffer.push(highByte(NAV_POSHOLD.maxClimbRate));

                buffer.push(lowByte(NAV_POSHOLD.maxManualSpeed));
                buffer.push(highByte(NAV_POSHOLD.maxManualSpeed));

                buffer.push(lowByte(NAV_POSHOLD.maxManualClimbRate));
                buffer.push(highByte(NAV_POSHOLD.maxManualClimbRate));

                buffer.push(NAV_POSHOLD.maxBankAngle);
                buffer.push(NAV_POSHOLD.useThrottleMidForAlthold);

                buffer.push(lowByte(NAV_POSHOLD.hoverThrottle));
                buffer.push(highByte(NAV_POSHOLD.hoverThrottle));
                break;

            case MSPCodes.MSP_SET_CALIBRATION_DATA:

                buffer.push(lowByte(CALIBRATION_DATA.accZero.X));
                buffer.push(highByte(CALIBRATION_DATA.accZero.X));

                buffer.push(lowByte(CALIBRATION_DATA.accZero.Y));
                buffer.push(highByte(CALIBRATION_DATA.accZero.Y));

                buffer.push(lowByte(CALIBRATION_DATA.accZero.Z));
                buffer.push(highByte(CALIBRATION_DATA.accZero.Z));

                buffer.push(lowByte(CALIBRATION_DATA.accGain.X));
                buffer.push(highByte(CALIBRATION_DATA.accGain.X));

                buffer.push(lowByte(CALIBRATION_DATA.accGain.Y));
                buffer.push(highByte(CALIBRATION_DATA.accGain.Y));

                buffer.push(lowByte(CALIBRATION_DATA.accGain.Z));
                buffer.push(highByte(CALIBRATION_DATA.accGain.Z));

                buffer.push(lowByte(CALIBRATION_DATA.magZero.X));
                buffer.push(highByte(CALIBRATION_DATA.magZero.X));

                buffer.push(lowByte(CALIBRATION_DATA.magZero.Y));
                buffer.push(highByte(CALIBRATION_DATA.magZero.Y));

                buffer.push(lowByte(CALIBRATION_DATA.magZero.Z));
                buffer.push(highByte(CALIBRATION_DATA.magZero.Z));

                buffer.push(lowByte(Math.round(CALIBRATION_DATA.opflow.Scale * 256)));
                buffer.push(highByte(Math.round(CALIBRATION_DATA.opflow.Scale * 256)));

                //if (semver.gte(CONFIG.flightControllerVersion, "2.6.0")) {
                    buffer.push(lowByte(CALIBRATION_DATA.magGain.X));
                    buffer.push(highByte(CALIBRATION_DATA.magGain.X));

                    buffer.push(lowByte(CALIBRATION_DATA.magGain.Y));
                    buffer.push(highByte(CALIBRATION_DATA.magGain.Y));

                    buffer.push(lowByte(CALIBRATION_DATA.magGain.Z));
                    buffer.push(highByte(CALIBRATION_DATA.magGain.Z));
                //}

                break;

            case MSPCodes.MSP_SET_POSITION_ESTIMATION_CONFIG:
                buffer.push(lowByte(POSITION_ESTIMATOR.w_z_baro_p * 100));
                buffer.push(highByte(POSITION_ESTIMATOR.w_z_baro_p * 100));

                buffer.push(lowByte(POSITION_ESTIMATOR.w_z_gps_p * 100));
                buffer.push(highByte(POSITION_ESTIMATOR.w_z_gps_p * 100));

                buffer.push(lowByte(POSITION_ESTIMATOR.w_z_gps_v * 100));
                buffer.push(highByte(POSITION_ESTIMATOR.w_z_gps_v * 100));

                buffer.push(lowByte(POSITION_ESTIMATOR.w_xy_gps_p * 100));
                buffer.push(highByte(POSITION_ESTIMATOR.w_xy_gps_p * 100));

                buffer.push(lowByte(POSITION_ESTIMATOR.w_xy_gps_v * 100));
                buffer.push(highByte(POSITION_ESTIMATOR.w_xy_gps_v * 100));

                buffer.push(POSITION_ESTIMATOR.gps_min_sats);
                buffer.push(POSITION_ESTIMATOR.use_gps_velned);
                break;

            case MSPCodes.MSP_SET_RTH_AND_LAND_CONFIG:
                buffer.push(lowByte(RTH_AND_LAND_CONFIG.minRthDistance));
                buffer.push(highByte(RTH_AND_LAND_CONFIG.minRthDistance));

                buffer.push(RTH_AND_LAND_CONFIG.rthClimbFirst);
                buffer.push(RTH_AND_LAND_CONFIG.rthClimbIgnoreEmergency);
                buffer.push(RTH_AND_LAND_CONFIG.rthTailFirst);
                buffer.push(RTH_AND_LAND_CONFIG.rthAllowLanding);
                buffer.push(RTH_AND_LAND_CONFIG.rthAltControlMode);

                buffer.push(lowByte(RTH_AND_LAND_CONFIG.rthAbortThreshold));
                buffer.push(highByte(RTH_AND_LAND_CONFIG.rthAbortThreshold));

                buffer.push(lowByte(RTH_AND_LAND_CONFIG.rthAltitude));
                buffer.push(highByte(RTH_AND_LAND_CONFIG.rthAltitude));

                buffer.push(lowByte(RTH_AND_LAND_CONFIG.landMinAltVspd));
                buffer.push(highByte(RTH_AND_LAND_CONFIG.landMinAltVspd));

                buffer.push(lowByte(RTH_AND_LAND_CONFIG.landMaxAltVspd));
                buffer.push(highByte(RTH_AND_LAND_CONFIG.landMaxAltVspd));

                buffer.push(lowByte(RTH_AND_LAND_CONFIG.landSlowdownMinAlt));
                buffer.push(highByte(RTH_AND_LAND_CONFIG.landSlowdownMinAlt));

                buffer.push(lowByte(RTH_AND_LAND_CONFIG.landSlowdownMaxAlt));
                buffer.push(highByte(RTH_AND_LAND_CONFIG.landSlowdownMaxAlt));

                buffer.push(lowByte(RTH_AND_LAND_CONFIG.emergencyDescentRate));
                buffer.push(highByte(RTH_AND_LAND_CONFIG.emergencyDescentRate));
                break;

            case MSPCodes.MSP_SET_FW_CONFIG:

                buffer.push(lowByte(FW_CONFIG.cruiseThrottle));
                buffer.push(highByte(FW_CONFIG.cruiseThrottle));

                buffer.push(lowByte(FW_CONFIG.minThrottle));
                buffer.push(highByte(FW_CONFIG.minThrottle));

                buffer.push(lowByte(FW_CONFIG.maxThrottle));
                buffer.push(highByte(FW_CONFIG.maxThrottle));

                buffer.push(FW_CONFIG.maxBankAngle);
                buffer.push(FW_CONFIG.maxClimbAngle);
                buffer.push(FW_CONFIG.maxDiveAngle);
                buffer.push(FW_CONFIG.pitchToThrottle);

                buffer.push(lowByte(FW_CONFIG.loiterRadius));
                buffer.push(highByte(FW_CONFIG.loiterRadius));

                break;

            case MSPCodes.MSP_SET_FILTER_CONFIG:
                buffer.push(FILTER_CONFIG.gyroSoftLpfHz);

                buffer.push(lowByte(FILTER_CONFIG.dtermLpfHz));
                buffer.push(highByte(FILTER_CONFIG.dtermLpfHz));

                buffer.push(lowByte(FILTER_CONFIG.yawLpfHz));
                buffer.push(highByte(FILTER_CONFIG.yawLpfHz));

                buffer.push(lowByte(FILTER_CONFIG.gyroNotchHz1));
                buffer.push(highByte(FILTER_CONFIG.gyroNotchHz1));

                buffer.push(lowByte(FILTER_CONFIG.gyroNotchCutoff1));
                buffer.push(highByte(FILTER_CONFIG.gyroNotchCutoff1));

                buffer.push(lowByte(FILTER_CONFIG.dtermNotchHz));
                buffer.push(highByte(FILTER_CONFIG.dtermNotchHz));

                buffer.push(lowByte(FILTER_CONFIG.dtermNotchCutoff));
                buffer.push(highByte(FILTER_CONFIG.dtermNotchCutoff));

                buffer.push(lowByte(FILTER_CONFIG.gyroNotchHz2));
                buffer.push(highByte(FILTER_CONFIG.gyroNotchHz2));

                buffer.push(lowByte(FILTER_CONFIG.gyroNotchCutoff2));
                buffer.push(highByte(FILTER_CONFIG.gyroNotchCutoff2));

                buffer.push(lowByte(FILTER_CONFIG.accNotchHz));
                buffer.push(highByte(FILTER_CONFIG.accNotchHz));

                buffer.push(lowByte(FILTER_CONFIG.accNotchCutoff));
                buffer.push(highByte(FILTER_CONFIG.accNotchCutoff));

                buffer.push(lowByte(FILTER_CONFIG.gyroStage2LowpassHz));
                buffer.push(highByte(FILTER_CONFIG.gyroStage2LowpassHz));

                break;

            case MSPCodes.MSP_SET_PID_ADVANCED:
                buffer.push(lowByte(PID_ADVANCED.rollPitchItermIgnoreRate));
                buffer.push(highByte(PID_ADVANCED.rollPitchItermIgnoreRate));

                buffer.push(lowByte(PID_ADVANCED.yawItermIgnoreRate));
                buffer.push(highByte(PID_ADVANCED.yawItermIgnoreRate));

                buffer.push(lowByte(PID_ADVANCED.yawPLimit));
                buffer.push(highByte(PID_ADVANCED.yawPLimit));

                buffer.push(0); //BF: currentProfile->pidProfile.deltaMethod
                buffer.push(0); //BF: currentProfile->pidProfile.vbatPidCompensation
                buffer.push(0); //BF: currentProfile->pidProfile.setpointRelaxRatio

                buffer.push(PID_ADVANCED.dtermSetpointWeight);
                buffer.push(lowByte(PID_ADVANCED.pidSumLimit));
                buffer.push(highByte(PID_ADVANCED.pidSumLimit));

                buffer.push(0); //BF: currentProfile->pidProfile.itermThrottleGain

                buffer.push(lowByte(PID_ADVANCED.axisAccelerationLimitRollPitch));
                buffer.push(highByte(PID_ADVANCED.axisAccelerationLimitRollPitch));

                buffer.push(lowByte(PID_ADVANCED.axisAccelerationLimitYaw));
                buffer.push(highByte(PID_ADVANCED.axisAccelerationLimitYaw));
                break;

            case MSPCodes.MSP_SET_SENSOR_CONFIG:
                buffer.push(SENSOR_CONFIG.accelerometer);
                buffer.push(SENSOR_CONFIG.barometer);
                buffer.push(SENSOR_CONFIG.magnetometer);
                buffer.push(SENSOR_CONFIG.pitot);
                buffer.push(SENSOR_CONFIG.rangefinder);
                buffer.push(SENSOR_CONFIG.opflow);
                break;

            
            case MSPCodes.MSP_WP_MISSION_SAVE:
                // buffer.push(0);
                console.log(buffer);

                break;
            case MSPCodes.MSP_WP_MISSION_LOAD:
                // buffer.push(0);
                console.log(buffer);

                break;

            case MSPCodes.MSP2_ARDUPILOT_SET_MIXER:
                buffer.push(MIXER_CONFIG.yawMotorDirection);
                buffer.push(lowByte(MIXER_CONFIG.yawJumpPreventionLimit));
                buffer.push(highByte(MIXER_CONFIG.yawJumpPreventionLimit));
                buffer.push(MIXER_CONFIG.platformType);
                buffer.push(MIXER_CONFIG.hasFlaps);
                buffer.push(lowByte(MIXER_CONFIG.appliedMixerPreset));
                buffer.push(highByte(MIXER_CONFIG.appliedMixerPreset));
                break;

            case MSPCodes.MSP2_ARDUPILOT_SET_MC_BRAKING:
                buffer.push(lowByte(BRAKING_CONFIG.speedThreshold));
                buffer.push(highByte(BRAKING_CONFIG.speedThreshold));
                buffer.push(lowByte(BRAKING_CONFIG.disengageSpeed));
                buffer.push(highByte(BRAKING_CONFIG.disengageSpeed));
                buffer.push(lowByte(BRAKING_CONFIG.timeout));
                buffer.push(highByte(BRAKING_CONFIG.timeout));

                buffer.push(BRAKING_CONFIG.boostFactor);

                buffer.push(lowByte(BRAKING_CONFIG.boostTimeout));
                buffer.push(highByte(BRAKING_CONFIG.boostTimeout));
                buffer.push(lowByte(BRAKING_CONFIG.boostSpeedThreshold));
                buffer.push(highByte(BRAKING_CONFIG.boostSpeedThreshold));
                buffer.push(lowByte(BRAKING_CONFIG.boostDisengageSpeed));
                buffer.push(highByte(BRAKING_CONFIG.boostDisengageSpeed));

                buffer.push(BRAKING_CONFIG.bankAngle);
                break;

            default:
                return false;
        }

        return buffer;
    };

    /**
     * Set raw Rx values over MSP protocol.
     *
     * Channels is an array of 16-bit unsigned integer channel values to be sent. 8 channels is probably the maximum.
     */
    self.setRawRx = function (channels) {
        var buffer = [];

        for (var i = 0; i < channels.length; i++) {
            buffer.push(specificByte(channels[i], 0));
            buffer.push(specificByte(channels[i], 1));
        }

        MSP.send_message(MSPCodes.MSP_SET_RAW_RC, buffer, false);
    };

    self.sendBlackboxConfiguration = function (onDataCallback) {
    var buffer = [];
    var messageId = MSPCodes.MSP_SET_BLACKBOX_CONFIG;
    buffer.push(BLACKBOX.blackboxDevice & 0xFF);
        messageId = MSPCodes.MSP2_SET_BLACKBOX_CONFIG;
        buffer.push(lowByte(BLACKBOX.blackboxRateNum));
        buffer.push(highByte(BLACKBOX.blackboxRateNum));
        buffer.push(lowByte(BLACKBOX.blackboxRateDenom));
        buffer.push(highByte(BLACKBOX.blackboxRateDenom));
        //noinspection JSUnusedLocalSymbols
        MSP.send_message(messageId, buffer, false, function (response) {
        onDataCallback();
        });
    };

    self.sendServoConfigurations = function (onCompleteCallback) {
        var nextFunction = send_next_servo_configuration;

        var servoIndex = 0;

        if (SERVO_CONFIG.length == 0) {
            onCompleteCallback();
        } else {
            nextFunction();
        }

        function send_next_servo_configuration() {

            var buffer = [];

            // send one at a time, with index

            var servoConfiguration = SERVO_CONFIG[servoIndex];

            buffer.push(servoIndex);

            buffer.push(lowByte(servoConfiguration.min));
            buffer.push(highByte(servoConfiguration.min));

            buffer.push(lowByte(servoConfiguration.max));
            buffer.push(highByte(servoConfiguration.max));

            buffer.push(lowByte(servoConfiguration.middle));
            buffer.push(highByte(servoConfiguration.middle));

            buffer.push(lowByte(servoConfiguration.rate));

            buffer.push(0);
            buffer.push(0);

            var out = servoConfiguration.indexOfChannelToForward;
            if (out == undefined) {
                out = 255; // Cleanflight defines "CHANNEL_FORWARDING_DISABLED" as "(uint8_t)0xFF"
            }
            buffer.push(out);

            //Mock 4 bytes of servoConfiguration.reversedInputSources
            buffer.push(0);
            buffer.push(0);
            buffer.push(0);
            buffer.push(0);

            // prepare for next iteration
            servoIndex++;
            if (servoIndex == SERVO_CONFIG.length) {
                nextFunction = onCompleteCallback;
            }
            MSP.send_message(MSPCodes.MSP_SET_SERVO_CONFIGURATION, buffer, false, null);
            nextFunction();
        }
    };

    self.sendServoMixer = function (onCompleteCallback) {
        var nextFunction = sendMixer,
            servoIndex = 0;

        if (SERVO_RULES.length == 0) {
            onCompleteCallback();
        } else {
            nextFunction();
        }

        function sendMixer() {

            var buffer = [];

            // send one at a time, with index

            var servoRule = SERVO_RULES.get()[servoIndex];

            //ARDUPILOT 2.2 uses different MSP frame
            buffer.push(servoIndex);
            buffer.push(servoRule.getTarget());
            buffer.push(servoRule.getInput());
            buffer.push(lowByte(servoRule.getRate()));
            buffer.push(highByte(servoRule.getRate()));
            buffer.push(servoRule.getSpeed());
            buffer.push(servoRule.getConditionId());

            // prepare for next iteration
            servoIndex++;
            if (servoIndex == SERVO_RULES.getServoRulesCount()) { //This is the last rule. Not pretty, but we have to send all rules
                nextFunction = onCompleteCallback;
            }
            MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SET_SERVO_MIXER, buffer, false, null);
            nextFunction();
        }
    };

    self.sendMotorMixer = function (onCompleteCallback) {

        var nextFunction = sendMixer,
            servoIndex = 0;

        if (MOTOR_RULES.length === 0) {
            onCompleteCallback();
        } else {
            nextFunction();
        }

        function sendMixer() {

            var buffer = [];

            // send one at a time, with index

            var rule = MOTOR_RULES.get()[servoIndex];

            if (rule) {

                buffer.push(servoIndex);

                buffer.push(lowByte(rule.getThrottleForMsp()));
                buffer.push(highByte(rule.getThrottleForMsp()));

                buffer.push(lowByte(rule.getRollForMsp()));
                buffer.push(highByte(rule.getRollForMsp()));

                buffer.push(lowByte(rule.getPitchForMsp()));
                buffer.push(highByte(rule.getPitchForMsp()));

                buffer.push(lowByte(rule.getYawForMsp()));
                buffer.push(highByte(rule.getYawForMsp()));

                // prepare for next iteration
                servoIndex++;
                if (servoIndex == MOTOR_RULES.getMotorCount()) { //This is the last rule. Not pretty, but we have to send all rules
                    nextFunction = onCompleteCallback;
                }
                MSP.send_message(MSPCodes.MSP2_COMMON_SET_MOTOR_MIXER, buffer, false, null);
                nextFunction();
            } else {
                onCompleteCallback();
            }
        }
    };

    self.loadLogicConditions = function (callback) {
        MSP.send_message(MSPCodes.MSP2_ARDUPILOT_LOGIC_CONDITIONS, false, false, null);  callback(); // without a response, we'll call the callback anyway
    }

    self.sendLogicConditions = function (onCompleteCallback) {
        let nextFunction = sendCondition,
            conditionIndex = 0;

        if (LOGIC_CONDITIONS.getCount() == 0) {
            onCompleteCallback();
        } else {
            nextFunction();
        }

        function sendCondition() {

            let buffer = [];

            // send one at a time, with index, 14 bytes per one condition

            let condition = LOGIC_CONDITIONS.get()[conditionIndex];

            buffer.push(conditionIndex);
            buffer.push(condition.getEnabled());
            //if (semver.gte(CONFIG.flightControllerVersion, "2.5.0")) {
                buffer.push(condition.getActivatorId());
            //}
            buffer.push(condition.getOperation());
            buffer.push(condition.getOperandAType());
            buffer.push(specificByte(condition.getOperandAValue(), 0));
            buffer.push(specificByte(condition.getOperandAValue(), 1));
            buffer.push(specificByte(condition.getOperandAValue(), 2));
            buffer.push(specificByte(condition.getOperandAValue(), 3));
            buffer.push(condition.getOperandBType());
            buffer.push(specificByte(condition.getOperandBValue(), 0));
            buffer.push(specificByte(condition.getOperandBValue(), 1));
            buffer.push(specificByte(condition.getOperandBValue(), 2));
            buffer.push(specificByte(condition.getOperandBValue(), 3));
            buffer.push(condition.getFlags());

            // prepare for next iteration
            conditionIndex++;
            if (conditionIndex == LOGIC_CONDITIONS.getCount()) { //This is the last rule. Not pretty, but we have to send all rules
                nextFunction = onCompleteCallback;
            }
            MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SET_LOGIC_CONDITIONS, buffer, false, null);
            nextFunction();
        }
    };

    self.loadProgrammingPid = function (callback) {
        MSP.send_message(MSPCodes.MSP2_ARDUPILOT_PROGRAMMING_PID, false, false, null);  callback(); // without a response, we'll call the callback anyway
    }

    self.sendProgrammingPid = function (onCompleteCallback) {
        let nextFunction = sendPid,
            pidIndex = 0;

        if (PROGRAMMING_PID.getCount() == 0) {
            onCompleteCallback();
        } else {
            nextFunction();
        }

        function sendPid() {

            let buffer = [];

            // send one at a time, with index, 20 bytes per one condition

            let pid = PROGRAMMING_PID.get()[pidIndex];

            buffer.push(pidIndex);
            buffer.push(pid.getEnabled());
            buffer.push(pid.getSetpointType());
            buffer.push(specificByte(pid.getSetpointValue(), 0));
            buffer.push(specificByte(pid.getSetpointValue(), 1));
            buffer.push(specificByte(pid.getSetpointValue(), 2));
            buffer.push(specificByte(pid.getSetpointValue(), 3));
            buffer.push(pid.getMeasurementType());
            buffer.push(specificByte(pid.getMeasurementValue(), 0));
            buffer.push(specificByte(pid.getMeasurementValue(), 1));
            buffer.push(specificByte(pid.getMeasurementValue(), 2));
            buffer.push(specificByte(pid.getMeasurementValue(), 3));
            buffer.push(specificByte(pid.getGainP(), 0));
            buffer.push(specificByte(pid.getGainP(), 1));
            buffer.push(specificByte(pid.getGainI(), 0));
            buffer.push(specificByte(pid.getGainI(), 1));
            buffer.push(specificByte(pid.getGainD(), 0));
            buffer.push(specificByte(pid.getGainD(), 1));
            buffer.push(specificByte(pid.getGainFF(), 0));
            buffer.push(specificByte(pid.getGainFF(), 1));

            // prepare for next iteration
            pidIndex++;
            if (pidIndex == PROGRAMMING_PID.getCount()) { //This is the last rule. Not pretty, but we have to send all rules
                nextFunction = onCompleteCallback;
            }
            MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SET_PROGRAMMING_PID, buffer, false, null);
            nextFunction();
        }
    };

    self.sendModeRanges = function (onCompleteCallback) {
        var nextFunction = send_next_mode_range;

        var modeRangeIndex = 0;

        if (MODE_RANGES.length == 0) {
            onCompleteCallback();
        } else {
            send_next_mode_range();
        }

        function send_next_mode_range() {

            var modeRange = MODE_RANGES[modeRangeIndex];

            var buffer = [];
            buffer.push(modeRangeIndex);
            buffer.push(modeRange.id);
            buffer.push(modeRange.auxChannelIndex);
            buffer.push((modeRange.range.start - 900) / 25);
            buffer.push((modeRange.range.end - 900) / 25);

            // prepare for next iteration
            modeRangeIndex++;
            if (modeRangeIndex == MODE_RANGES.length) {
                nextFunction = onCompleteCallback;

            }
            MSP.send_message(MSPCodes.MSP_SET_MODE_RANGE, buffer, false, null);
            nextFunction();
        }
    };

    /**
     * Send a request to read a block of data from the dataflash at the given address and pass that address and a ArrayBuffer
     * of the returned data to the given callback (or null for the data if an error occured).
     */
    self.dataflashRead = function (address, onDataCallback) {
        var buffer = [];
        buffer.push(address & 0xFF);
        buffer.push((address >> 8) & 0xFF);
        buffer.push((address >> 16) & 0xFF);
        buffer.push((address >> 24) & 0xFF);

        // For API > 2.0.0 we support requesting payload size - request 4KiB and let firmware decide what actual size to send
        if (CONFIG.apiVersion && semver.gte(CONFIG.apiVersion, "2.0.0")) {
            buffer.push(lowByte(4096));
            buffer.push(highByte(4096));
        }

        MSP.send_message(MSPCodes.MSP_DATAFLASH_READ, buffer, false, function (response) {
          /*   buzz - not impl!

            var chunkAddress = response.data.getUint32(0, 1);

            // Verify that the address of the memory returned matches what the caller asked for
            if (chunkAddress == address) {
                // Strip that address off the front of the reply and deliver it separately so the caller doesn't have to
                // figure out the reply format:
                 //
                onDataCallback(address, response.data.buffer.slice(4));
            } else {
                // Report error
                onDataCallback(address, null);
            }
            */
        });
    };

    self.sendRxFailConfig = function (onCompleteCallback) {
        var nextFunction = send_next_rxfail_config;

        var rxFailIndex = 0;

        if (RXFAIL_CONFIG.length == 0) {
            onCompleteCallback();
        } else {
            send_next_rxfail_config();
        }

        function send_next_rxfail_config() {

            var rxFail = RXFAIL_CONFIG[rxFailIndex];

            var buffer = [];
            buffer.push(rxFailIndex);
            buffer.push(rxFail.mode);
            buffer.push(lowByte(rxFail.value));
            buffer.push(highByte(rxFail.value));

            // prepare for next iteration
            rxFailIndex++;
            if (rxFailIndex == RXFAIL_CONFIG.length) {
                nextFunction = onCompleteCallback;

            }
            MSP.send_message(MSPCodes.MSP_SET_RXFAIL_CONFIG, buffer, false, null);
            nextFunction();
        }
    };

    /**
     * @return {number}
     */
    self.SERIAL_PORT_FUNCTIONSToMask = function (functions) {
        var mask = 0;
        for (var index = 0; index < functions.length; index++) {
            var key = functions[index];
            var bitIndex = mspHelper.SERIAL_PORT_FUNCTIONS[key];
            if (bitIndex >= 0) {
                mask = bit_set(mask, bitIndex);
            }
        }
        return mask;
    };

    self.serialPortFunctionMaskToFunctions = function (functionMask) {
        var functions = [];

        var keys = Object.keys(mspHelper.SERIAL_PORT_FUNCTIONS);
        for (var index = 0; index < keys.length; index++) {
            var key = keys[index];
            var bit = mspHelper.SERIAL_PORT_FUNCTIONS[key];
            if (bit_check(functionMask, bit)) {
                functions.push(key);
            }
        }
        return functions;
    };

    self.sendServoMixRules = function (onCompleteCallback) {
        // TODO implement
        onCompleteCallback();
    };

    self.sendAdjustmentRanges = function (onCompleteCallback) {
        var nextFunction = send_next_adjustment_range;

        var adjustmentRangeIndex = 0;

        if (ADJUSTMENT_RANGES.length == 0) {
            onCompleteCallback();
        } else {
            send_next_adjustment_range();
        }


        function send_next_adjustment_range() {

            var adjustmentRange = ADJUSTMENT_RANGES[adjustmentRangeIndex];

            var buffer = [];
            buffer.push(adjustmentRangeIndex);
            buffer.push(adjustmentRange.slotIndex);
            buffer.push(adjustmentRange.auxChannelIndex);
            buffer.push((adjustmentRange.range.start - 900) / 25);
            buffer.push((adjustmentRange.range.end - 900) / 25);
            buffer.push(adjustmentRange.adjustmentFunction);
            buffer.push(adjustmentRange.auxSwitchChannelIndex);

            // prepare for next iteration
            adjustmentRangeIndex++;
            if (adjustmentRangeIndex == ADJUSTMENT_RANGES.length) {
                nextFunction = onCompleteCallback;

            }
            MSP.send_message(MSPCodes.MSP_SET_ADJUSTMENT_RANGE, buffer, false, null);
            nextFunction();
        }
    };

    self.sendLedStripColors = function (onCompleteCallback) {
        if (LED_COLORS.length == 0) {
            onCompleteCallback();
        } else {
            var buffer = [];

            for (var colorIndex = 0; colorIndex < LED_COLORS.length; colorIndex++) {
                var color = LED_COLORS[colorIndex];

                buffer.push(specificByte(color.h, 0));
                buffer.push(specificByte(color.h, 1));
                buffer.push(color.s);
                buffer.push(color.v);
            }
            MSP.send_message(MSPCodes.MSP_SET_LED_COLORS, buffer, false, null);
            onCompleteCallback();
        }
    };

    self.sendLedStripConfig = function (onCompleteCallback) {

        var nextFunction = send_next_led_strip_config;

        var ledIndex = 0;

        if (LED_STRIP.length == 0) {
            onCompleteCallback();
        } else {
            send_next_led_strip_config();
        }

        function send_next_led_strip_config() {

            var led = LED_STRIP[ledIndex];
            /*
             var led = {
             directions: directions,
             functions: functions,
             x: data.getUint8(offset++, 1),
             y: data.getUint8(offset++, 1),
             color: data.getUint8(offset++, 1)
             };
             */
            var buffer = [],
                directionLetterIndex,
                functionLetterIndex,
                bitIndex;

            buffer.push(ledIndex);

            var mask = 0;
            /*
                ledDirectionLetters:        ['n', 'e', 's', 'w', 'u', 'd'],      // in LSB bit order
                ledFunctionLetters:         ['i', 'w', 'f', 'a', 't', 'r', 'c', 'g', 's', 'b', 'l'], // in LSB bit order
                ledBaseFunctionLetters:     ['c', 'f', 'a', 'l', 's', 'g', 'r'], // in LSB bit
                ledOverlayLetters:          ['t', 'o', 'b', 'n', 'i', 'w'], // in LSB bit

                */
            mask |= (led.y << 0);
            mask |= (led.x << 4);

            for (functionLetterIndex = 0; functionLetterIndex < led.functions.length; functionLetterIndex++) {
                var fnIndex = MSP.ledBaseFunctionLetters.indexOf(led.functions[functionLetterIndex]);
                if (fnIndex >= 0) {
                    mask |= (fnIndex << 8);
                    break;
                }
            }

            for (var overlayLetterIndex = 0; overlayLetterIndex < led.functions.length; overlayLetterIndex++) {

                bitIndex = MSP.ledOverlayLetters.indexOf(led.functions[overlayLetterIndex]);
                if (bitIndex >= 0) {
                    mask |= bit_set(mask, bitIndex + 12);
                }

            }

            mask |= (led.color << 18);

            for (directionLetterIndex = 0; directionLetterIndex < led.directions.length; directionLetterIndex++) {

                bitIndex = MSP.ledDirectionLetters.indexOf(led.directions[directionLetterIndex]);
                if (bitIndex >= 0) {
                    mask |= bit_set(mask, bitIndex + 22);
                }

            }

            mask |= (0 << 28); // parameters


            buffer.push(specificByte(mask, 0));
            buffer.push(specificByte(mask, 1));
            buffer.push(specificByte(mask, 2));
            buffer.push(specificByte(mask, 3));

            // prepare for next iteration
            ledIndex++;
            if (ledIndex == LED_STRIP.length) {
                nextFunction = onCompleteCallback;
            }

            MSP.send_message(MSPCodes.MSP_SET_LED_STRIP_CONFIG, buffer, false, null);
            nextFunction();
        }
    };

    self.sendLedStripModeColors = function (onCompleteCallback) {

        var nextFunction = send_next_led_strip_mode_color;
        var index = 0;

        if (LED_MODE_COLORS.length == 0) {
            onCompleteCallback();
        } else {
            send_next_led_strip_mode_color();
        }

        function send_next_led_strip_mode_color() {
            var buffer = [];

            var mode_color = LED_MODE_COLORS[index];

            buffer.push(mode_color.mode);
            buffer.push(mode_color.direction);
            buffer.push(mode_color.color);

            // prepare for next iteration
            index++;
            if (index == LED_MODE_COLORS.length) {
                nextFunction = onCompleteCallback;
            }

            MSP.send_message(MSPCodes.MSP_SET_LED_STRIP_MODECOLOR, buffer, false, null);
            nextFunction();
        }
    };

    /*
     * Basic sending methods used for chaining purposes
     */

    /**
     * @deprecated
     * @param callback
     */
    self.loadMspIdent = function (callback) {
        MSP.send_message(MSPCodes.MSP_IDENT, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadARDUPILOTPidConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_ARDUPILOT_PID, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadLoopTime = function (callback) {
        MSP.send_message(MSPCodes.MSP_LOOP_TIME, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadAdvancedConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_ADVANCED_CONFIG, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadFilterConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_FILTER_CONFIG, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadPidAdvanced = function (callback) {
        MSP.send_message(MSPCodes.MSP_PID_ADVANCED, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadRcTuningData = function (callback) {
        MSP.send_message(MSPCodes.MSP_RC_TUNING, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadRateProfileData = function (callback) {
        MSP.send_message(MSPCodes.MSPV2_ARDUPILOT_RATE_PROFILE, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadPidData = function (callback) {
        MSP.send_message(MSPCodes.MSP2_PID, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadPidNames = function (callback) {
        MSP.send_message(MSPCodes.MSP_PIDNAMES, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadStatus = function (callback) {
        MSP.send_message(MSPCodes.MSP_STATUS, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadBfConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_BF_CONFIG, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.queryFcStatus = function (callback) {
        MSP.send_message(MSPCodes.MSPV2_ARDUPILOT_STATUS, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadMisc = function (callback) {
        MSP.send_message(MSPCodes.MSP_MISC, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadMiscV2 = function (callback) {
        MSP.send_message(MSPCodes.MSPV2_ARDUPILOT_MISC, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadOutputMapping = function (callback) {
        MSP.send_message(MSPCodes.MSPV2_ARDUPILOT_OUTPUT_MAPPING, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadBatteryConfig = function (callback) {
    MSP.send_message(MSPCodes.MSPV2_BATTERY_CONFIG, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadArmingConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_ARMING_CONFIG, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadRxConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_RX_CONFIG, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.load3dConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_3D, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadSensorAlignment = function (callback) {
        MSP.send_message(MSPCodes.MSP_SENSOR_ALIGNMENT, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadSensorConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SENSOR_CONFIG, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadSensorStatus = function (callback) {
        MSP.send_message(MSPCodes.MSP_SENSOR_STATUS, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadRcDeadband = function (callback) {
        MSP.send_message(MSPCodes.MSP_RC_DEADBAND, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadRcMap = function (callback) {
        MSP.send_message(MSPCodes.MSP_RX_MAP, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadRcData = function (callback) {
        MSP.send_message(MSPCodes.MSP_RC, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadAccTrim = function (callback) {
        MSP.send_message(MSPCodes.MSP_ACC_TRIM, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadAnalog = function (callback) {
        MSP.send_message(MSPCodes.MSP_ANALOG, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveToEeprom = function saveToEeprom(callback) {
        MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveARDUPILOTPidConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_ARDUPILOT_PID, mspHelper.crunch(MSPCodes.MSP_SET_ARDUPILOT_PID), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveLooptimeConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_LOOP_TIME, mspHelper.crunch(MSPCodes.MSP_SET_LOOP_TIME), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveAdvancedConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveFilterConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_FILTER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FILTER_CONFIG), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.savePidData = function (callback) {
        MSP.send_message(MSPCodes.MSP2_SET_PID, mspHelper.crunch(MSPCodes.MSP2_SET_PID), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveRcTuningData = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_RC_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_RC_TUNING), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveRateProfileData = function (callback) {
        MSP.send_message(MSPCodes.MSPV2_ARDUPILOT_SET_RATE_PROFILE, mspHelper.crunch(MSPCodes.MSPV2_ARDUPILOT_SET_RATE_PROFILE), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.savePidAdvanced = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_PID_ADVANCED, mspHelper.crunch(MSPCodes.MSP_SET_PID_ADVANCED), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveBfConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_BF_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BF_CONFIG), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveMisc = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_MISC, mspHelper.crunch(MSPCodes.MSP_SET_MISC), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveMiscV2 = function (callback) {
        MSP.send_message(MSPCodes.MSPV2_ARDUPILOT_SET_MISC, mspHelper.crunch(MSPCodes.MSPV2_ARDUPILOT_SET_MISC), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveBatteryConfig = function (callback) {
        MSP.send_message(MSPCodes.MSPV2_SET_BATTERY_CONFIG, mspHelper.crunch(MSPCodes.MSPV2_SET_BATTERY_CONFIG), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.save3dConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_3D, mspHelper.crunch(MSPCodes.MSP_SET_3D), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveSensorAlignment = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_SENSOR_ALIGNMENT, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_ALIGNMENT), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveAccTrim = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_ACC_TRIM, mspHelper.crunch(MSPCodes.MSP_SET_ACC_TRIM), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveArmingConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveRxConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveSensorConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_SENSOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_CONFIG), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadNavPosholdConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_NAV_POSHOLD, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveNavPosholdConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_NAV_POSHOLD, mspHelper.crunch(MSPCodes.MSP_SET_NAV_POSHOLD), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadPositionEstimationConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_POSITION_ESTIMATION_CONFIG, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.savePositionEstimationConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_POSITION_ESTIMATION_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_POSITION_ESTIMATION_CONFIG), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadCalibrationData = function (callback) {
        MSP.send_message(MSPCodes.MSP_CALIBRATION_DATA, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveCalibrationData = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_CALIBRATION_DATA, mspHelper.crunch(MSPCodes.MSP_SET_CALIBRATION_DATA), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadRthAndLandConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_RTH_AND_LAND_CONFIG, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveRthAndLandConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_SET_RTH_AND_LAND_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RTH_AND_LAND_CONFIG), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.loadFwConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_FW_CONFIG, false, false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.saveFwConfig = function (callback) {
            MSP.send_message(MSPCodes.MSP_SET_FW_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FW_CONFIG), false, null);  callback(); // without a response, we'll call the callback anyway
    };

    self.getMissionInfo = function (callback) {
        //MSP.send_message(MSPCodes.MSP_WP_GETINFO, false, false, null);  
        callback(); // without a response, we'll call the callback anyway
    };
    
    self.loadWaypoints = function (callback) { //getWaypointsFromFC
        MISSION_PLANER.reinit();
        let waypointId = 1;

        get_mission_from_drone(callback);
        // //MSP.send_message(MSPCodes.MSP_WP_GETINFO, false, false, null);
        // getFirstWP();
        
        // function getFirstWP() {
        //     //MSP.send_message(MSPCodes.MSP_WP, [waypointId], false, null);
        //     nextWaypoint();
        // };
        
        // function nextWaypoint() {
        //     waypointId++;
        //     if (waypointId < MISSION_PLANER.getCountBusyPoints()) {
        //        // MSP.send_message(MSPCodes.MSP_WP, [waypointId], false, null);
        //         nextWaypoint();
        //     }
        //     else {
        //         //MSP.send_message(MSPCodes.MSP_WP, [waypointId], false, null);  
        //         callback(); // without a response, we'll call the callback anyway
        //     }
        // };
        //callback();
    };
     
    self.saveWaypoints = function (callback) {  //sendWaypointsToFC
        let waypointId = 1;

        //buzz MISSION_PLANER todo, this isn't interaactive with the gui yet.

        send_canned_mission_to_drone();


        //MSP.send_message(MSPCodes.MSP_SET_WP, MISSION_PLANER.extractBuffer(waypointId), false, null);
        // nextWaypoint();

        // function nextWaypoint() {
        //     waypointId++;
        //     if (waypointId < MISSION_PLANER.get().length) {
        //         //MSP.send_message(MSPCodes.MSP_SET_WP, MISSION_PLANER.extractBuffer(waypointId), false, null);
        //         nextWaypoint();
        //     }
        //     else {
        //         //MSP.send_message(MSPCodes.MSP_SET_WP, MISSION_PLANER.extractBuffer(waypointId), false, null);
        //         endMission();
        //     }
        // };
        
        // function endMission() {
        //     //MSP.send_message(MSPCodes.MSP_WP_GETINFO, false, false, null);  
        //     callback(); // without a response, we'll call the callback anyway
        // }
    };
    
    self.loadSafehomes = function (callback) {
        SAFEHOMES.flush();
        let safehomeId = 0;
        //MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SAFEHOME, [safehomeId], false, null);
        nextSafehome();
        
        function nextSafehome() {
            safehomeId++;
            if (safehomeId < SAFEHOMES.getMaxSafehomeCount()-1) {
                //MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SAFEHOME, [safehomeId], false, null);
                nextSafehome();
            }
            else {
                //MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SAFEHOME, [safehomeId], false, null);  
                callback(); // without a response, we'll call the callback anyway
            }
        };
    };
    
    self.saveSafehomes = function (callback) {
        let safehomeId = 0;
        //MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SET_SAFEHOME, SAFEHOMES.extractBuffer(safehomeId), false, null);
        nextSendSafehome();
        
        function nextSendSafehome() {
            safehomeId++;
            if (safehomeId < SAFEHOMES.getMaxSafehomeCount()-1) {
                //MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SET_SAFEHOME, SAFEHOMES.extractBuffer(safehomeId), false, null);
                nextSendSafehome();
            }
            else {
                //MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SET_SAFEHOME, SAFEHOMES.extractBuffer(safehomeId), false, null);  
                callback(); // without a response, we'll call the callback anyway
            }
        };
    };

    // self._getSetting = function (name) {
    //     if (SETTINGS[name]) {
    //         //return Promise.resolve(
    //             SETTINGS[name];//);
    //     }
    //    // var data = [];
    // }
        // self._encodeSettingReference(name, null, data);
        // return MSP.promise(MSPCodes.MSP2_COMMON_SETTING_INFO, data).then(function (result) {


    self.makeNewSetting = function (name) {

        const MODE_LOOKUP =  0;
        //const MODE_LOOKUP =  1; // buzz todo 

        // buzz todo - do we want to put all the ardupilot params into this 'Settings' obj?

            // var settingTypes = {
            //     0: "uint8_t",
            //     1: "int8_t",
            //     2: "uint16_t",
            //     3: "int16_t",
            //     4: "uint32_t",
            //     5: "float",
            //     6: "string",
            // };
            // var setting = {};

            // var type = 0; // buzz hack, all are unsigned int 8
            //var type = 6; // buzz hack, all are string

        //     // Discard setting name
        //     if (semver.gte(CONFIG.apiVersion, "2.4.0")) {
        //         result.data.readString();
        //     }

        //     // buzz hack for undefined data:
        //    if ( result == undefined) result = {};
        //    if ( result.data == undefined) result.data = new Uint16Array();


        //     // Discard PG ID
        //     result.data.readU16();

        //     var type = result.data.readU8();
            // setting.type = settingTypes[type];
            // if (!setting.type) {
            //     console.log("Unknown setting type " + type + " for setting '" + name + "'");
            //   //  return null;
            // }
        //     // Discard section
        //     result.data.readU8();
            // setting.mode = MODE_LOOKUP;//result.data.readU8();
            // setting.min = 0; //result.data.read32();
            // setting.max = 12; // result.data.readU32();

        //     setting.index = result.data.readU16();

        //     // Discard profile info
        //     result.data.readU8();
        //     result.data.readU8();

            // if (setting.mode == MODE_LOOKUP) {
            //     var values = [];
            //     for (var ii = setting.min; ii <= setting.max; ii++) {
            //         //values.push(result.data.readString());
            //         values.push(ii); //buzz todo
            //     }
            //     setting.table = {values: values};
            // }
            setting = ALLSETTINGS[name] ;
            return setting;
        // });
    }

    self._encodeSettingReference = function (name, index, data) {
        if (Number.isInteger(index)) {
            data.push8(0);
            data.push16(index);
        } else {
            for (var ii = 0; ii < name.length; ii++) {
                data.push(name.charCodeAt(ii));
            }
            data.push(0);
        }
    };

    self.getSetting = function (name) {
        console.log("SETTINGS param/setting name:"+name);
        if (ALLSETTINGS[name]) {
               return ALLSETTINGS[name];
        }
        //this.makeNewSetting(name); // make it first, then return it
        return null; //ALLSETTINGS[name];
    }
        //.then(function (setting) {
        //     if (!setting) {
        //         // Setting not available in the FC
        //         return null;
        //     }
        //     var data = [];
        //     $this._encodeSettingReference(name, setting.index, data); // determines if Integer or String etc

        //     // promise that presumably when given a 'setting' value as raw data casts it into different
        //     //   byte/unsigned/8/16/32 bit values etc 
        //     return MSP.promise(MSPCodes.MSPV2_SETTING, data).then(function (resp) {
        //         var value;
        //         switch (setting.type) {
        //             case "uint8_t":
        //                 value = resp.data.getUint8(0);
        //                 break;
        //             case "int8_t":
        //                 value = resp.data.getInt8(0);
        //                 break;
        //             case "uint16_t":
        //                 value = resp.data.getUint16(0, true);
        //                 break;
        //             case "int16_t":
        //                 value = resp.data.getInt16(0, true);
        //                 break;
        //             case "uint32_t":
        //                 value = resp.data.getUint32(0, true);
        //                 break;
        //             case "float":
        //                 var fi32 = resp.data.getUint32(0, true);
        //                 var buf = new ArrayBuffer(4);
        //                 (new Uint32Array(buf))[0] = fi32;
        //                 value = (new Float32Array(buf))[0];
        //                 break;
        //             default:
        //                 throw "Unknown setting type " + setting.type;
        //         }
        //         return {setting: setting, value: value};
        //     });
        // });
    //};

    self.encodeSetting = function (name, value) {
        return this._getSetting(name); 
        //.then(function (setting) {
          //  if (setting === null ) { 
          //      console.log("null-setting. name:"+name+" value:"+value); 
          //      return []; 
            //}
            // if (setting.table && !Number.isInteger(value)) {
            //     var found = false;
            //     for (var ii = 0; ii < setting.table.values.length; ii++) {
            //         if (setting.table.values[ii] == value) {
            //             value = ii;
            //             found = true;
            //             break;
            //         }
            //     }
            //     if (!found) {
            //         throw 'Invalid value "' + value + '" for setting ' + name;
            //     }
            // }
            // var data = [];
            // self._encodeSettingReference(name, setting.index, data);
            // switch (setting.type) {
            //     case "uint8_t":
            //     case "int8_t":
            //         data.push8(value);
            //         break;
            //     case "uint16_t":
            //     case "int16_t":
            //         data.push16(value);
            //         break;
            //     case "uint32_t":
            //         data.push32(value);
            //         break;
            //     case "float":
            //         var buf = new ArrayBuffer(4);
            //         (new Float32Array(buf))[0] = value;
            //         var if32 = (new Uint32Array(buf))[0];
            //         data.push32(if32);
            //         break;
            //     default:
            //         throw "Unknown setting type " + setting.type;
            // }
         //   return data;
        //});
    };

    self.setSetting = function (name, value) {
        this.encodeSetting(name, value).then(function (data) {
            return MSP.promise(MSPCodes.MSPV2_SET_SETTING, data);
        });
    };

    self.getRTC = function (callback) {
        MSP.send_message(MSPCodes.MSP_RTC, false, false, function (resp) {
            var seconds = resp.data.read32();
            var millis = resp.data.readU16();
            if (callback) {
                //callback(seconds, millis);
            }
        });
        callback(seconds, millis);
    };

    self.setRTC = function (callback) {
        var now = Date.now();
        var secs = now / 1000;
        var millis = now % 1000;
        var data = [];
        data.push32(secs);
        data.push16(millis);
        MSP.send_message(MSPCodes.MSP_SET_RTC, data, false, null);  
        callback(); // without a response, we'll call the callback anyway
    };

    self.loadServoConfiguration = function (callback) {
        MSP.send_message(MSPCodes.MSP_SERVO_CONFIGURATIONS, false, false, null);  
        callback(); // without a response, we'll call the callback anyway
    };

    self.loadServoMixRules = function (callback) {
        MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SERVO_MIXER, false, false, null);  
        callback(); // without a response, we'll call the callback anyway
    };

    self.loadMotorMixRules = function (callback) {
        MSP.send_message(MSPCodes.MSP2_COMMON_MOTOR_MIXER, false, false, null);  
        callback(); // without a response, we'll call the callback anyway
    };

    self.loadMotors = function (callback) {
        //MSP.send_message(MSPCodes.MSP_MOTOR, false, false, null);  
        callback(); // without a response, we'll call the callback anyway
    };

    self.getCraftName = function(callback) {
        MSP.send_message(MSPCodes.MSP_NAME, false, false, function(resp) {
            if ( resp == undefined ) return; // buzz hack
             var name = resp.data.readString();
            if (callback) {
                //callback(name);
            }
        });
        callback();
    };

    self.setCraftName = function(name, callback) {
        var data = [];
        name = name || "";
        for (var ii = 0; ii < name.length; ii++) {
            data.push(name.charCodeAt(ii));
        }
        MSP.send_message(MSPCodes.MSP_SET_NAME, data, false, null);  
        callback(); // without a response, we'll call the callback anyway
    };

    self.loadMixerConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP2_ARDUPILOT_MIXER, false, false, null); 
         callback(); // without a response, we'll call the callback anyway
    };

    self.saveMixerConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SET_MIXER, mspHelper.crunch(MSPCodes.MSP2_ARDUPILOT_SET_MIXER), false, null); 
         callback(); // without a response, we'll call the callback anyway
    };

    self.loadVTXConfig = function (callback) {
        MSP.send_message(MSPCodes.MSP_VTX_CONFIG, false, false, null);  
        callback(); // without a response, we'll call the callback anyway
    };

    self.saveVTXConfig = function(callback) {
        MSP.send_message(MSPCodes.MSP_SET_VTX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_VTX_CONFIG), false, null);  
        callback(); // without a response, we'll call the callback anyway
    };

    self.loadBrakingConfig = function(callback) {
        MSP.send_message(MSPCodes.MSP2_ARDUPILOT_MC_BRAKING, false, false, null); 
         callback(); // without a response, we'll call the callback anyway
    }

    self.saveBrakingConfig = function(callback) {
        MSP.send_message(MSPCodes.MSP2_ARDUPILOT_SET_MC_BRAKING, mspHelper.crunch(MSPCodes.MSP2_ARDUPILOT_SET_MC_BRAKING), false, null); 
         callback(); // without a response, we'll call the callback anyway
    };

    self.loadParameterGroups = function(callback) {
        MSP.send_message(MSPCodes.MSP2_COMMON_PG_LIST, false, false, function (resp) {
            var groups = [];
            while (resp.data.offset < resp.data.byteLength) {
                var id = resp.data.readU16();
                var start = resp.data.readU16();
                var end = resp.data.readU16();
                groups.push({id: id, start: start, end: end});
            }
            if (callback) {
               // callback(groups);
            }
        });
        callback(groups);
    };

    self.loadBrakingConfig = function(callback) {
        MSP.send_message(MSPCodes.MSP2_ARDUPILOT_MC_BRAKING, false, false, null); 
         callback(); // without a response, we'll call the callback anyway
    }

    self.loadLogicConditionsStatus = function (callback) {
        MSP.send_message(MSPCodes.MSP2_ARDUPILOT_LOGIC_CONDITIONS_STATUS, false, false, null); 
         callback(); // without a response, we'll call the callback anyway
    };

    self.loadGlobalVariablesStatus = function (callback) {
        //if (semver.gte(CONFIG.flightControllerVersion, "2.5.0")) {
            MSP.send_message(MSPCodes.MSP2_ARDUPILOT_GVAR_STATUS, false, false, null);  
            callback(); // without a response, we'll call the callback anyway
        //} else {
        //    callback();
        //}
    };

    self.loadProgrammingPidStatus = function (callback) {
        //if (semver.gte(CONFIG.flightControllerVersion, "2.6.0")) {
            MSP.send_message(MSPCodes.MSP2_ARDUPILOT_PROGRAMMING_PID_STATUS, false, false, null); 
             callback(); // without a response, we'll call the callback anyway
        //} else {
        //    callback();
        //}
    };

    return self;
})(GUI);
