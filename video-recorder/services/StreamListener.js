/***********************************************************************************/
/*                                                                                 */
/*        Service for the stream listener.                                         */
/*        Will listen to the port until some data will stream,                     */
/*        and after that will emit 'StreamingData' event and stop listen.          */
/*                                                                                 */
/***********************************************************************************/

// require packege needed.
var dgram = require('dgram'),
    promise = require('bluebird');
var event = require('./EventEmitterSingleton');

// Defiend the Service name.
const SERVICE_NAME = 'StreamListener',
    LOCALHOST = '0.0.0.0',
    MAX_BINDING_TRIES = 3;

// export our service.
module.exports = StreamListener;

// Stream Listener Service.
function StreamListener() {
    // private variables
    var _ip,
        _port,
        _server;

    /***********************************************************************************/
    /*                                                                                 */
    /*  Function That Start listen to address and wait until there is some data flow.  */
    /*  Should get an object with Ip and Port.                                         */
    /*                                                                                 */
    /***********************************************************************************/
    var startListen = function(params) {
        const METHOD_NAME = 'StartListen';
        var bindingAttemptsCounts = 0;
        console.log('#' + SERVICE_NAME + '#', METHOD_NAME, ' start running...\n params: ', JSON.stringify(params));

        // check Port in params
        if (!params.Port) {
            event.emit('error', '#' + SERVICE_NAME + '# Error on ' + METHOD_NAME + ' : There Is no Port To listen');
            return;
        }
        _port = params.Port;

        // check Ip in params
        _ip = params.Ip ? params.Ip : LOCALHOST;

        // create socket server
        _server = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        while (bindingAttemptsCounts < MAX_BINDING_TRIES) {
            try {
                // binding the server to listen to the address that given
                _server.bind({ port: _port, address: _ip, exclusive: false }, () => {
                    // check if the IP is not 0.0.0.0
                    if (_ip !== LOCALHOST) {
                        _server.addMembership(_ip);
                    }
                    console.log('#' + SERVICE_NAME + '#', 'Binding To : ', _ip, ':', _port, ' succeed');
                });
                break;
            } catch (err) {
                bindingAttemptsCounts++;
                if (bindingAttemptsCounts === MAX_BINDING_TRIES) {
                    return promise.reject('#' + SERVICE_NAME + '# Error on ' + METHOD_NAME + ' : Binding to source failed');
                }
                // Wait 2 seconds before continuing for the next bind try
                setTimeout(function() {}, 2000);
                continue;
                }
            }

            // on event of data flow
            _server.on('message', (msg, rinfo) => {
                console.log('#' + SERVICE_NAME + '#', 'Stop listening, Data Was detected at ', _ip, ':', _port, ' !');
                // close the server so that the port will be open for the ffmpeg process to recording
                _server.close();
                // emmit an event so it could go next processing
                event.emit('StreamingData');
            });

            // when unexcepted error eccured.
            _server.on('error', (err) => {
                event.emit('error', '#' + SERVICE_NAME + '# Unexcepted Error eccured while trying listen to the address ' +
                    _ip + ':' + _port + ' : ' + err);
                _server.close();
            });
        };

    return {
        startListen: startListen
    };
}

