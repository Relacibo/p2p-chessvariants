import {
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Tip,
} from "grommet";
import React from "react";
import { useSelector } from "react-redux";
import style from "./Peer.module.css";
import { selectPeerConnecting, selectPeerConnections } from "./peerSlice";

type PeerTooltipProps = {
  children: JSX.Element | JSX.Element[] | never[];
};

const PeerTooltip = (props: PeerTooltipProps) => {
  const { children } = props;
  const connecting = useSelector(selectPeerConnecting);
  const connections = useSelector(selectPeerConnections);
  const connectingElements = connecting.map((peerId) => (
    <TableRow className={style.connecting}>
      <TableCell>{peerId}</TableCell>
      <TableCell>
        <Spinner />
      </TableCell>
    </TableRow>
  ));
  const connectedElements = Object.entries(connections).map(
    ([uuid, peerId]) => (
      <TableRow className={style.connected}>
        <TableCell>{peerId}</TableCell>
        <TableCell>{uuid}</TableCell>
      </TableRow>
    )
  );

  return (
    <Tip
      content={
        <Table>
          <TableHeader>
            <TableRow>
              <TableCell scope="col" border="bottom">
                PeerId
              </TableCell>
              <TableCell scope="col" border="bottom">
                UUID
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {connectingElements}
            {connectedElements}
          </TableBody>
        </Table>
      }
    >
      {children}
    </Tip>
  );
};

export default PeerTooltip;
