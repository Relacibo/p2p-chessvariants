import { AppThunk } from "../../app/store";

export type MessageHandler = (packet: Packet) => AppThunk;

export type Packet = {
  from: string;
  message: PeerMessage;
};

export type PeerMessage = {
  type: string;
};