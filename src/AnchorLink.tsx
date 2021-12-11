import { Anchor, AnchorExtendedProps } from "grommet/components/Anchor";
import { Link, LinkProps } from "react-router-dom";
import React from "react";

const AnchorLink: React.FC<AnchorLinkProps> = (props) => {
  return <Anchor as={Link} {...props} />;
};

export type AnchorLinkProps = LinkProps & AnchorExtendedProps;

export default AnchorLink;
