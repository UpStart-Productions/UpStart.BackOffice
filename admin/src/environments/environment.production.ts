export const environment = {
  apiBaseUrl: '/api',
  useCognito: true,
  cognitoGoogleSignIn: false,
  cognito: {
    userPoolId: 'REPLACE_ME',
    userPoolClientId: 'REPLACE_ME',
    region: 'us-west-2',
    domainPrefix: 'REPLACE_ME',
    customDomain: undefined as string | undefined,
    redirectSignIn: 'https://app.upstartbackoffice.com/',
    redirectSignOut: 'https://app.upstartbackoffice.com/',
  },
};
