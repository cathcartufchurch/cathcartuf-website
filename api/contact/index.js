const { app } = require('@azure/functions');
const { EmailClient } = require('@azure/communication-email');

app.http('contact', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
            context.log('Connection string exists:', !!connectionString);
            
            return {
                status: 200,
                jsonBody: { 
                    message: "Test",
                    hasConnectionString: !!connectionString
                }
            };
        } catch (error) {
            return {
                status: 500,
                jsonBody: { error: error.message }
            };
        }
    }
});