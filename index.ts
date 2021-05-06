import * as http from 'http';
const client = require('prom-client');
import {
    Connection, Message, ConnectionOptions, Delivery, AwaitableSenderOptions, AwaitableSender, EventContext
} from "rhea-promise";


const register = new client.Registry()
client.collectDefaultMetrics({ register, labels: { NODE_APP_INSTANCE: process.env.POD_NAME || "sender" } })


const host = process.env.AMQP_HOST
const username = process.env.AMQP_USERNAME
const password = process.env.AMQP_PASSWORD
const port = parseInt(process.env.AMQP_PORT || "5671");
const senderAddress = process.env.SENDER_ADDRESS

const req_counter = new client.Counter({
    name: 'http_eventhub_requests_total',
    help: 'Counter for total requests received',
    labelNames: ['status'],
    registers: [register]
});

let link_credit = 0
new client.Gauge({
    name: 'http_eventhub_link_credit',
    help: 'AMPQ link credit',
    collect() {
        // Invoked when the registry collects its metrics' values.
        // This can be synchronous or it can return a promise/be an async function.
        this.set(link_credit);
    },
    registers: [register]
});


const req_duration = new client.Histogram({
    name: 'http_eventhub_request_duration_seconds',
    help: 'Duration in mS of HTTP requests in seconds',
    labelNames: ['partition'],
    buckets: [5, 10, 20, 50, 100, 250, 500, 1000, 5000, 10000],
    registers: [register]
});


async function main(): Promise<{ sender: AwaitableSender, connection: Connection }> {

    console.log('opening connections')

    let message_idx = 0

    // eventhub sdk
    // const client = new EventHubProducerClient(service.connectionString, service.path);
    // await client.getPartitionIds({});
    //  // Trigger a disconnect on the underlying connection.
    // clientConnectionContext.connection["_connection"].idle();
    // const partitionIds = await client.getPartitionIds({});
    // const newConnectionId = clientConnectionContext.connectionId;
    //  should.not.equal(originalConnectionId, newConnectionId);

    // https://github.com/Azure/azure-sdk-for-js/blob/master/sdk/eventhub/event-hubs/src/eventHubProducerClient.ts
    // https://github.com/Azure/azure-sdk-for-js/blob/master/sdk/eventhub/event-hubs/src/eventHubSender.ts
    // https://github.com/Azure/azure-sdk-for-js/blob/master/sdk/eventhub/event-hubs/src/connectionContext.ts



    const connection: Connection = new Connection({
        transport: "tls",
        host: host,
        hostname: host,
        username: username,
        password: password,
        port: port,
        idle_time_out: 60000, // 60 seconds
        reconnect: false
    } as ConnectionOptions)

    const name = process.env.POD_NAME || "sender"
    const awaitableSenderOptions: AwaitableSenderOptions = {
        name,
        target: {
            address: senderAddress
        },
        sendTimeoutInSeconds: 10,
        onError: (context: EventContext) => {
            const senderError = context.sender && context.sender.error;
            if (senderError) {
                console.log(">>>>> [%s] An error occurred for sender '%s': %O.",
                    connection.id, name, senderError);
            }
        },
        onSessionError: (context: EventContext) => {
            const sessionError = context.session && context.session.error;
            if (sessionError) {
                console.log(">>>>> [%s] An error occurred for session of sender '%s': %O.",
                    connection.id, name, sessionError);
            }
        }
    };

    await connection.open();
    // Notice that we are awaiting on the message being sent.
    const sender: AwaitableSender = await connection.createAwaitableSender(
        awaitableSenderOptions
    );

    console.log(`sender.credit=${sender.credit}, sender.sendable=${sender.sendable()}`)

    const server = http.createServer(async (req, res) => {
        const [urlpath, params] = req.url.split('?')
        if (urlpath === '/metrics/counter') {
            try {
                res.setHeader('Content-Type', register.contentType);
                res.end(await register.getSingleMetricAsString('test_counter'));
            } catch (ex) {
                res.statusCode = 500
                res.end(ex)
            }
        } else if (urlpath === '/metrics') {
            try {
                res.setHeader('Content-Type', register.contentType);
                res.end(await register.metrics());
            } catch (ex) {
                res.statusCode = 500
                res.end(ex)
            }
        } else if (urlpath === '/') {
            const start = Date.now()
            const ip = res.socket.remoteAddress;
            const port = res.socket.remotePort;
            let message_id = name + '-' + message_idx++
            const message: Message = {
                body: `${message_id}: from ${process.env.POD_NAME || "sender"}`,
                message_id
            };
            // Note: Here we are awaiting for the send to complete.
            // You will notice that `delivery.settled` will be `true`, irrespective of whether the promise resolves or rejects.
            try {
                link_credit = sender.credit
                const delivery: Delivery = await sender.send(message);
                req_duration.observe(Date.now() - start)
                req_counter.inc({ status: '200' })
                res.end(`[${connection.id}] await sendMessage -> message_id: ${message_id}, Delivery id: ${delivery.id}, settled: ${delivery.settled}`);
            } catch (e) {
                res.statusCode = 500
                req_counter.inc({ status: res.statusCode.toString() })
                res.end(JSON.stringify(e))
            }
        } else {
            res.end()
        }
    }).listen(3000);

    return { sender, connection }
}

main()
    .then(({ sender, connection }) => {
        async function exitHandler(options, exitCode) {
            if (options.cleanup) {
                console.log('closing connections')
                await sender.close();
                await connection.close();
            }
            //if (exitCode || exitCode === 0) console.log(exitCode);
            if (options.exit) process.exit();
        }

        //do something when app is closing
        process.on('exit', exitHandler.bind(null, { cleanup: true }));

        //catches ctrl+c event
        process.on('SIGINT', exitHandler.bind(null, { exit: true }));

        // catches "kill pid" (for example: nodemon restart)
        process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
        process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));

        //catches uncaught exceptions
        process.on('uncaughtException', exitHandler.bind(null, { exit: true }));
    })
    .catch((err) => console.log(err))

//process.stdin.resume();//so the program will not close instantly





