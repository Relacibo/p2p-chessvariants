import {
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Drop,
  Button,
} from "grommet";
import { Clear, Close } from "grommet-icons/icons";
import React from "react";
import { useSelector } from "react-redux";
import style from "./Peer.module.css";
import { disconnectFromPeer, selectPeerConnecting, selectPeerConnections } from "./peerSlice";
import { useAppDispatch } from "../../app/hooks";

type PeerTooltipProps = {
  target: React.MutableRefObject<HTMLInputElement>;
  close: () => void;
};

const PeerDrop = (props: PeerTooltipProps) => {
  const dispatch = useAppDispatch();
  const { target, close } = props;
  const connecting = useSelector(selectPeerConnecting);
  const connections = useSelector(selectPeerConnections);
  return (
    <Drop target={target.current}>
      <Button style={{ position: "absolute", right: 0 }} onClick={close}>
        <Close />
      </Button>
      {connecting.length + Object.keys(connections).length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableCell scope="col" border="bottom">
                PeerId
              </TableCell>
              <TableCell scope="col" border="bottom">
                UUID
              </TableCell>
              <TableCell scope="col" border="bottom"></TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {connecting
              .map((peerId) => (
                <TableRow key={peerId} className={style.connecting}>
                  <TableCell>{peerId}</TableCell>
                  <TableCell>
                    <Spinner color="status-warning" />
                  </TableCell>
                  <TableCell>
                      <Button onClick={() => dispatch(disconnectFromPeer(peerId))}>
                        <Clear />
                      </Button>
                  </TableCell>
                </TableRow>
              ))
              .concat(
                Object.entries(connections).map(([uuid, peerId]) => (
                  <TableRow key={peerId} className={style.connected}>
                    <TableCell>{peerId}</TableCell>
                    <TableCell>{uuid}</TableCell>
                    <TableCell>
                      <Button onClick={() => dispatch(disconnectFromPeer(peerId))}>
                        <Clear />
                      </Button>
                    </TableCell>
                  </TableRow>
                )) || []
              )}
          </TableBody>
        </Table>
      ) : (
        <>Keine Verbindungen</>
      )}
    </Drop>
  );
};

export default PeerDrop;
