const { app } = require('@azure/functions');

app.http('contact', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const { EmailClient } = require('@azure/communication-email');
            
            const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
            const client = new EmailClient(connectionString);

            const emailMessage = {
                senderAddress: "donotreply@953990c2-e815-4ff0-b9d1-45cfc48b94ba.azurecomm.net",
                content: {
                    subject: `Test email`,
                    plainText: `Test message`
                },
                recipients: {
                    to: [{ address: "services@cathcartuf.org.uk" }]
                }
            };

            const poller = await client.beginSend(emailMessage);
            const result = await poller.pollUntilDone();

            return {
                status: 200,
                jsonBody: { message: "Sent! Status: " + result.status }
            };

        } catch (error) {
            return {
                status: 200,
                jsonBody: { message: "Caught error: " + error.message }
            };
        }
    }
});