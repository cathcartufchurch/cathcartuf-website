const { app } = require('@azure/functions');

app.http('prayer', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const { EmailClient } = require('@azure/communication-email');
            
            const body = await request.json();
            const { name, email, phone, prayerRequest, isPrivate, wantZoom } = body;

            if (!name || !prayerRequest) {
                return { 
                    status: 400,
                    jsonBody: { error: "Missing required fields" }
                };
            }

            const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
            const client = new EmailClient(connectionString);

            const privacyNote = isPrivate ? "[PRIVATE REQUEST]" : "[SHARED WITH PRAYER TEAM]";

            let contactInfo = "";
            if (email) contactInfo += `\nEmail: ${email}`;
            if (phone) contactInfo += `\nPhone: ${phone}`;
            if (wantZoom) contactInfo += `\n\n[Requested Monday Zoom prayer meeting details]`;

            const emailMessage = {
                senderAddress: "Cathcart UF Website <donotreply@953990c2-e815-4ff0-b9d1-45cfc48b94ba.azurecomm.net>",
                content: {
                    subject: `Cathcart UF: Prayer request from ${name} ${privacyNote}`,
                    plainText: `${privacyNote}\n\nName: ${name}${contactInfo}\n\nPrayer Request:\n${prayerRequest}`
                },
                recipients: {
                    to: [{ address: "prayer@cathcartuf.org.uk" }]
                }
            };

            const poller = await client.beginSend(emailMessage);
            const result = await poller.pollUntilDone();
            context.log(`Prayer request sent with status: ${result.status}`);

            return {
                status: 200,
                jsonBody: { message: "Thank you for your prayer request. The prayer team will remember you in prayer." }
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