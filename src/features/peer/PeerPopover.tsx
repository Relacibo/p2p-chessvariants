import React from "react";
import { useSelector } from "react-redux";
import style from "./Peer.module.css";
import {
  disconnectFromPeer,
  selectPeerConnecting,
  selectPeerConnections,
} from "./peerSlice";
import { useAppDispatch } from "../../app/hooks";
import { Button, Loader, Popover, PopoverProps, Table } from "@mantine/core";
import { IconUnlink } from "@tabler/icons";

type PeerPopoverProps = Partial<PopoverProps> & {
  target: React.ReactElement;
  opened: boolean;
  onClose: () => void;
};

const PeerPopover = (props: PeerPopoverProps) => {
  const dispatch = useAppDispatch();
  const connecting = useSelector(selectPeerConnecting);
  const connections = useSelector(selectPeerConnections);
  const createCloseButton = (peerId: string) => (
    <Button
      compact
      size="xs"
      variant="subtle"
      onClick={() => dispatch(disconnectFromPeer(peerId))}
    >
      <IconUnlink size="xs" />
    </Button>
  );
  const connectionTable = connecting
    .map((peerId) => (
      <tr key={peerId} className={style.connecting}>
        <td>{peerId}</td>
        <td>
          <Loader size="xs" color="red" />
        </td>
        <td>{createCloseButton(peerId)}</td>
      </tr>
    ))
    .concat(
      Object.entries(connections).map(([uuid, peerId]) => (
        <tr key={peerId} className={style.connected}>
          <td>{peerId}</td>
          <td>{uuid}</td>
          <td>{createCloseButton(peerId)}</td>
        </tr>
      )) || []
    );
  return (
    <Popover {...props}>
      {connecting.length + Object.keys(connections).length > 0 ? (
        <Table>
          <thead>
            <th>
              <tr>
                <th>PeerId</th>
                <th>UUID</th>
                <th> </th>
              </tr>
            </th>
          </thead>
          <tbody>{connectionTable}</tbody>
        </Table>
      ) : (
        <div>Keine Verbindungen</div>
      )}
    </Popover>
  );
};

export default PeerPopover;
