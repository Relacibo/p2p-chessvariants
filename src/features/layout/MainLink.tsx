import { UnstyledButton, UnstyledButtonProps } from "@mantine/core";
import { Link, To } from "react-router-dom";
import style from "./MainLink.module.css";

interface MainLinkProps {
  children: string;
  to: To;
  props?: UnstyledButtonProps;
}

function MainLink({ children, to, props }: MainLinkProps) {
  return (
    <UnstyledButton
      {...props}
      component={Link}
      to={to}
      className={style.mainLink}
    >
      {children}
    </UnstyledButton>
  );
}

export default MainLink;
