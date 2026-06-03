export const environment = {
  apiBaseUrl: '/api',
  useCognito: false,
  cognitoGoogleSignIn: false,
  cognito: null as {
    userPoolId: string;
    userPoolClientId: string;
    region: string;
    domainPrefix: string;
    customDomain?: string;
    redirectSignIn: string;
    redirectSignOut: string;
  } | null,
};
