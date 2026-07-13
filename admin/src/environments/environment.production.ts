export const environment = {
  apiBaseUrl: 'https://api.example.com/api',
  useCognito: true,
  cognitoGoogleSignIn: false,
  cognito: {
    userPoolId: 'REPLACE_ME',
    userPoolClientId: 'REPLACE_ME',
    region: 'us-west-2',
    domainPrefix: 'REPLACE_ME',
    customDomain: undefined as string | undefined,
    redirectSignIn: 'https://office.example.com/',
    redirectSignOut: 'https://office.example.com/',
  },
};
