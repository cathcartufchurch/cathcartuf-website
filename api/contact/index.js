const { app } = require('@azure/functions');

app.http('contact', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const { EmailClient } = require('@azure/communication-email');
            
            const body = await request.json();
            const { name, email, message, phone, wantZoom } = body;

            if (!name || !email || !message) {
                return { 
                    status: 400,
                    jsonBody: { error: "Missing required fields" }
                };
            }

            const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
            const client = new EmailClient(connectionString);

            const emailMessage = {
                senderAddress: "donotreply@953990c2-e815-4ff0-b9d1-45cfc48b94ba.azurecomm.net",
                content: {
                    subject: `Cathcart UF: Contact request message from ${name}`,
                    plainText: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nZoom: ${wantZoom ? 'Yes' : 'No'}\n\nMessage:\n${message}`
                },
                recipients: {
                    to: [{ address: "services@cathcartuf.org.uk" }]
                }
            };

            const poller = await client.beginSend(emailMessage);
            const result = await poller.pollUntilDone();
            context.log(`Email sent with status: ${result.status}`);

            return {
                status: 200,
                jsonBody: { message: "Thank you for contacting us. We will get back to you soon." }
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