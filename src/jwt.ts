import jwtDecode from "jwt-decode";

export type Claims = {
  sub: string;
  aud: string[];
  iss: string[];
  exp: number;
  iat: number;
};

export const decodeAuthClaims = (token: string): Claims => {
  let decodedClaims: any = jwtDecode(token);
  return {
    ...decodedClaims,
    exp: decodedClaims.exp,
    iat: decodedClaims.iat,
  };
};
