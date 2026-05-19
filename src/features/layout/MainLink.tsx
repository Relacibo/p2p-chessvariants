import { UnstyledButton, UnstyledButtonProps, Group } from "@mantine/core";
import { Link, To } from "react-router-dom";
import style from "./MainLink.module.css";
import React, { useContext } from "react";
import { LayoutContext } from "./Layout";

interface MainLinkProps {
  children: string;
  to: To;
  icon?: React.ReactNode;
  props?: UnstyledButtonProps;
}

function MainLink({ children, to, icon, props }: MainLinkProps) {
  const { setSidebarCollapsed } = useContext(LayoutContext);
  return (
    <UnstyledButton
      {...props}
      component={Link}
      to={to}
      className={style.mainLink}
      onClick={() => setSidebarCollapsed(true)}
    >
      <Group gap="sm">
        {icon}
        {children}
      </Group>
    </UnstyledButton>
  );
}

export default MainLink;
