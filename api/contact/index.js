const { app } = require('@azure/functions');

app.http('contact', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        return {
            status: 200,
            body: 'Hello World'
        };
    }
});