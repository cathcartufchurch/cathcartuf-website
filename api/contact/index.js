const { app } = require('@azure/functions');

app.http('contact', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        return {
            status: 200,
            body: 'Hello World'
        };
    }
});