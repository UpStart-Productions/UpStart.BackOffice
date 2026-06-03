export const environment = {
  apiBaseUrl: '/api',
  useCognito: true,
  cognito: {
    userPoolId: 'REPLACE_ME',
    userPoolClientId: 'REPLACE_ME',
    region: 'us-east-1',
    domainPrefix: 'REPLACE_ME',
    customDomain: undefined as string | undefined,
    redirectSignIn: 'https://app.upstartbackoffice.com/',
    redirectSignOut: 'https://app.upstartbackoffice.com/',
  },
};
