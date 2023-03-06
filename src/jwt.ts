import jwtDecode from "jwt-decode";

export type Claims = {
  sub: string;
  aud: string[];
  iss: string[];
  exp: Date;
  iat: Date;
};

export const decodeAuthClaims = (token: string): Claims => {
  let decodedClaims: any = jwtDecode(token);
  return {
    ...decodedClaims,
    exp: decodedClaims.exp * 1000,
    iat: decodedClaims.iat * 1000,
  };
};
