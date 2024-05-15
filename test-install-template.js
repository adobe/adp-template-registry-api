// code to call install template action and compare the result

const installAction = require('./actions/templates/install/index.js');
const IMS_ACCESS_TOKEN = 'eyJhbGciOiJSUzI1NiIsIng1dSI6Imltc19uYTEtc3RnMS1rZXktYXQtMS5jZXIiLCJraWQiOiJpbXNfbmExLXN0ZzEta2V5LWF0LTEiLCJpdHQiOiJhdCJ9.eyJpZCI6IjE3MTU3NTQ1NDE4OTFfYjI2YWRjNTAtZmMwOC00MDVkLTgyMzMtYWJiOWQ4MjQwNDFmX3ZhNmMyIiwidHlwZSI6ImFjY2Vzc190b2tlbiIsImNsaWVudF9pZCI6IlVEUFdlYjEiLCJ1c2VyX2lkIjoiNzA0NTIwRTE2M0Y0NkIwMzBBNDk0MTI4QEFkb2JlSUQiLCJzdGF0ZSI6IntcImpzbGlidmVyXCI6XCJ2Mi12MC40MS4wLTExLWdlY2Q0ODU2XCIsXCJub25jZVwiOlwiMjU5Njk4NDMxMTY0MDQ1OFwiLFwic2Vzc2lvblwiOlwiaHR0cHM6Ly9pbXMtbmExLXN0ZzEuYWRvYmVsb2dpbi5jb20vaW1zL3Nlc3Npb24vdjEvTlRoak5EUm1PRE10TURBd1l5MDBObUZoTFdKak56Z3RaVE14T0RVeE5qVmpOalZrTFMwM01EUTFNakJGTVRZelJqUTJRakF6TUVFME9UUXhNamhBUVdSdlltVkpSQVwifSIsImFzIjoiaW1zLW5hMS1zdGcxIiwiYWFfaWQiOiI3MDQ1MjBFMTYzRjQ2QjAzMEE0OTQxMjhAQWRvYmVJRCIsImN0cCI6MCwiZmciOiJZT0sySkVKUTNaMlZBNEJSUUdaTUFDSUFKNCIsInNpZCI6IjE3MTU3NTQ1NDE4ODJfZDZiMTI1YTctMzI4OC00MWJlLTlkYzAtNzFlMjY3MDBhNTkxX3ZhNmMyIiwibW9pIjoiZTgxZWUxYjQiLCJwYmEiOiJNZWRTZWNOb0VWLExvd1NlYyIsImV4cGlyZXNfaW4iOiI4NjQwMDAwMCIsImNyZWF0ZWRfYXQiOiIxNzE1NzU0NTQxODkxIiwic2NvcGUiOiJBZG9iZUlELG9wZW5pZCxhZG9iZWlvX2FwaSxnbmF2LHJlYWRfb3JnYW5pemF0aW9ucyxhZGRpdGlvbmFsX2luZm8ucHJvamVjdGVkUHJvZHVjdENvbnRleHQsdW5pZmllZF9kZXZfcG9ydGFsLGFkZGl0aW9uYWxfaW5mby5yb2xlcyxyZWFkX3BjLmRtYV9idWxsc2V5ZSxzZXNzaW9uLGFkb2JlaW8uYXBwcmVnaXN0cnkucmVhZCxhZG9iZWlvLmFwcHJlZ2lzdHJ5LndyaXRlLHRlc3QtdXNlcnMucmVhZCx0ZXN0LXVzZXJzLndyaXRlLGNsaWVudC5yZWFkLGRldmNvbnNvbGUuZW1haWxfYWxlcnRzLHNlcnZpY2VfcHJpbmNpcGFscy53cml0ZSxzZXJ2aWNlX3ByaW5jaXBhbHMucmVhZCxtYW5hZ2VfY2xpZW50X3NlY3JldHMsY2xpZW50Lm1hbmFnZS51aSxyZWFkX2NsaWVudF9zZWNyZXQifQ.NPJ5DRNMY5Gvc7EaB7dnW6px15fvUHO8UT2Q8DpcaMFhmPgxxiMwXf830Rpiujy1EZKWQkUOS0tuMXdADAJlsh0SXERGJXLvFz7tfHGvs57ZxbuxBD4QoGqEfFpt9kIY3-zX_65QUUfxoWoGLxwceD3DNOl15mmMiFmQ0CHHM-G84pNuG4D_qLuaj7NGnzt_2Uam1cup1rJihEvaT79HkHpSbJorHUOnKAHMNuwZ86A-JzdkqBZmVWq-1YGaqfclC4rhZEvWQKKDBtBIuIvN5fBgeNSO5miyolHBYZITKwsAWP_mitLgu7Iy6OPT-IMlQ6ctJ9417ZySmwYZUij90w';
const params = {
  IMS_URL: 'https://ims-na1-stg1.adobelogin.com',
  IMS_CLIENT_ID: 'adp-template-registry-service',
  MONGODB_URI: 'mongodb+srv://abdevtplregistryva6_readwrite_1:kim2Iimp2ffSCAkL@abdevtplregistryva6.mr9vcoc.mongodb.net/?retryWrites=true&w=majority&appName=ServerlessInstance0',
  MONGODB_NAME: 'abdevtplregistryva6',
  __ow_method: 'POST',
  templateId: '66183f50d1af1a36debd7d5a',
  orgId: '2B96335559A6E3AE0A49412E@AdobeOrg',
  projectName: 'testProject5',
  description: 'created for get credentials test',
  metadata: { },
  apis: [
    {
      code: 'PhotoshopCCESDK',
      credentialType: 'OAUTH_SERVER_TO_SERVER',
      flowType: 'ENTP',
      licenseConfigs: [
        {
          description: null,
          id: '510420386',
          name: 'Default Creative Cloud Automation Services configuration',
          productId: '2ED3D2780C7A21D2726B',
          op: 'add'
        }
      ]
    },
    {
      code: 'Firefly SDK - Enterprise - GA',
      credentialType: 'OAUTH_SERVER_TO_SERVER',
      flowType: 'ENTP',
      licenseConfigs: [
        {
          description: null,
          id: '510420449',
          name: 'Default Firefly and Creative Cloud Automation  configuration',
          productId: '93D1E414B01B3B567E9B',
          op: 'add'
        }
      ]
    }
  ],
  __ow_headers: {
    authorization: `Bearer ${IMS_ACCESS_TOKEN}`
  }

};
/**
 *
 * @param params
 */
async function main (params) {
  process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651stagejpn3-runtime-stage-b.ethos651-stage-jpn3.ethos.adobe.net';
  const response = await installAction.main(params);
  console.log(response);
}
main(params).then(r => console.log(r)).catch(e => console.error(e));
