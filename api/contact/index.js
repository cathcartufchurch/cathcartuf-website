const { app } = require('@azure/functions');
const { EmailClient } = require('@azure/communication-email');

app.http('contact', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const body = await request.json();
            const { name, email, message, phone, wantZoom } = body;

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

            const sendResult = await client.send(emailMessage);

            return {
                status: 200,
                jsonBody: { message: "Email sent: " + sendResult.messageId }
            };

        } catch (error) {
            context.log.error("Error:", error.message);
            return {
                status: 500,
                jsonBody: { error: error.message }
            };
        }
    }
});