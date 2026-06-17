const { app } = require('@azure/functions');

// Contact Form
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
            context.log(`Contact email sent: ${result.status}`);

            return {
                status: 200,
                jsonBody: { message: "Thank you for contacting us. We will get back to you soon." }
            };

        } catch (error) {
            context.log.error("Contact error:", error.message);
            return {
                status: 500,
                jsonBody: { error: error.message }
            };
        }
    }
});

// Prayer Request Form
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

            const privacyNote = isPrivate ? "[PRIVATE REQUEST]" : "[SHARE WITH PRAYER TEAM]";

            let contactInfo = "";
            if (email) contactInfo += `\nEmail: ${email}`;
            if (phone) contactInfo += `\nPhone: ${phone}`;
            if (wantZoom) contactInfo += `\n\n[Requested Monday Zoom prayer meeting details]`;

            const emailMessage = {
                senderAddress: "donotreply@953990c2-e815-4ff0-b9d1-45cfc48b94ba.azurecomm.net",
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
            context.log(`Prayer email sent: ${result.status}`);

            return {
                status: 200,
                jsonBody: { message: "Thank you for your prayer request. The prayer team will remember you in prayer." }
            };

        } catch (error) {
            context.log.error("Prayer error:", error.message);
            return {
                status: 500,
                jsonBody: { error: error.message }
            };
        }
    }
});

// OAuth: Step 1 — redirect editor to GitHub login
app.http('auth', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
        const redirectUri = encodeURIComponent(
            'https://test.cathcartuf.org.uk/api/auth-callback'
        );
        const scope = encodeURIComponent('repo,user');
        const githubAuthUrl =
            `https://github.com/login/oauth/authorize` +
            `?client_id=${clientId}` +
            `&redirect_uri=${redirectUri}` +
            `&scope=${scope}`;

        return {
            status: 302,
            headers: { location: githubAuthUrl }
        };
    }
});

// OAuth: Step 2 — GitHub returns here with a code; exchange it for a token
app.http('auth-callback', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const code = new URL(request.url).searchParams.get('code');
            if (!code) {
                return { status: 400, body: 'Missing code parameter' };
            }

            const tokenResponse = await fetch(
                'https://github.com/login/oauth/access_token',
                {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
                        client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
                        code: code
                    })
                }
            );

            const tokenData = await tokenResponse.json();

            if (tokenData.error) {
                return {
                    status: 400,
                    body: `GitHub OAuth error: ${tokenData.error_description}`
                };
            }

            const script = `
                <script>
                    (function() {
                        function receiveMessage(e) {
                            window.opener.postMessage(
                                'authorization:github:success:${JSON.stringify({ token: tokenData.access_token, provider: 'github' })}',
                                e.origin
                            );
                        }
                        window.addEventListener('message', receiveMessage, false);
                        window.opener.postMessage('authorizing:github', '*');
                    })();
                </scr` + `ipt>`;

            return {
                status: 200,
                headers: { 'content-type': 'text/html' },
                body: `<!DOCTYPE html><html><body>${script}</body></html>`
            };

        } catch (error) {
            return {
                status: 500,
                body: `OAuth error: ${error.message}`
            };
        }
    }
});

// Google Calendar — fetch events and return as JSON
app.http('calendar', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const crypto = require('crypto');
            const credentials = JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS);
            const calendarId = process.env.GOOGLE_CALENDAR_ID;

            // Build a JWT — like a signed letter that proves who we are to Google
            const now = Math.floor(Date.now() / 1000);

            function base64urlEncode(input) {
                const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
                return buf.toString('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=/g, '');
            }

            const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
            const claim = base64urlEncode(JSON.stringify({
                iss: credentials.client_email,
                scope: 'https://www.googleapis.com/auth/calendar.readonly',
                aud: 'https://oauth2.googleapis.com/token',
                exp: now + 3600,
                iat: now
            }));

            const sigInput = `${header}.${claim}`;
            const signer = crypto.createSign('SHA256');
            signer.update(sigInput);
            const signature = base64urlEncode(signer.sign(credentials.private_key));
            const jwt = `${sigInput}.${signature}`;

            // Exchange the JWT for a Google access token
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    assertion: jwt
                })
            });

            const tokenData = await tokenResponse.json();
            if (!tokenData.access_token) {
                throw new Error('Failed to get access token: ' + JSON.stringify(tokenData));
            }

            // Fetch events from Google Calendar — next 12 months, max 100 events
            const timeMin = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
            const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
            const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
                + `?timeMin=${timeMin}&timeMax=${timeMax}&orderBy=startTime&singleEvents=false&maxResults=100`;

            const eventsResponse = await fetch(apiUrl, {
                headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
            });

            const data = await eventsResponse.json();
            const events = (data.items || []).map(event => ({
                title: event.summary || 'No title',
                start: event.start.dateTime || event.start.date,
                end: event.end.dateTime || event.end.date,
                description: event.description || '',
                location: event.location || ''
            }));

            return {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=300'
                },
                jsonBody: events
            };

        } catch (error) {
            context.log.error('Calendar error:', error.message);
            return {
                status: 500,
                jsonBody: { error: error.message }
            };
        }
    }
});