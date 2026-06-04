export const environment = {
  apiBaseUrl: 'https://api.heyupstart.com/api',
  useCognito: true,
  cognitoGoogleSignIn: false,
  cognito: {
    userPoolId: 'REPLACE_ME',
    userPoolClientId: 'REPLACE_ME',
    region: 'us-west-2',
    domainPrefix: 'REPLACE_ME',
    customDomain: undefined as string | undefined,
    redirectSignIn: 'https://office.heyupstart.com/',
    redirectSignOut: 'https://office.heyupstart.com/',
  },
};
