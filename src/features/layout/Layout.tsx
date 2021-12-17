import { Box, Grid, Nav, Sidebar } from "grommet";
import React from "react";
import { Link } from "react-router-dom";
import AnchorLink from "../../AnchorLink";
import style from "./Layout.module.css";
import DarkmodeSelector from "../darkmode/DarkmodeSelector";

type LayoutProps = {
  children: JSX.Element | JSX.Element[] | never[];
};

function Layout(props: LayoutProps) {
  const { children } = props;

  return (
    <Grid
      fill
      rows={["flex"]}
      columns={["flex", "small"]}
      gap="small"
      areas={[["main", "sidebar"]]}
    >
      <Sidebar
        width="small"
        gridArea="sidebar"
        background={{
          color: "brand",
          image: "url(navbar-texture.png)",
        }}
      >
        <Link className={style.navbarTitle} to={"/"}>
          pawn-connect.org
        </Link>
        <Nav>
          <AnchorLink to={"game"}>Games</AnchorLink>
        </Nav>
        <DarkmodeSelector />
      </Sidebar>
      <Box gridArea="main">{children}</Box>
    </Grid>
  );
}

export default Layout;
