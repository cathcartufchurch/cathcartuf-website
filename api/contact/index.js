const { app } = require('@azure/functions');
const { EmailClient } = require('@azure/communication-email');

app.http('contact', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const body = await request.json();
            const { name, email, subject, message, phone, wantZoom } = body;

            if (!name || !email || !message) {
                return {
                    status: 400,
                    body: JSON.stringify({ error: "Missing required fields" })
                };
            }

            const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
            if (!connectionString) {
                return {
                    status: 500,
                    body: JSON.stringify({ error: "Server configuration error" })
                };
            }

            const client = new EmailClient(connectionString);

            const emailMessage = {
                senderAddress: "donotreply@953990c2-e815-4ff0-b9d1-45cfc48b94ba.azurecomm.net",
                content: {
                    subject: `New Contact Form: ${message.substring(0, 50)}`,
                    plainText: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nZoom: ${wantZoom ? 'Yes' : 'No'}\n\nMessage:\n${message}`
                },
                recipients: {
                    to: [{ address: "services@cathcartuf.org.uk" }]
                }
            };

            const sendResult = await client.send(emailMessage);
            context.log(`Email sent: ${sendResult.messageId}`);

            return {
                status: 200,
                body: JSON.stringify({ message: "Thank you for contacting us. We will get back to you soon." })
            };

        } catch (error) {
            context.log.error("Error:", error.message);
            return {
                status: 500,
                body: JSON.stringify({ error: error.message })
            };
        }
    }
});