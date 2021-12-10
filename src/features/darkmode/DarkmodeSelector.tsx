import { connect, ConnectedProps } from "react-redux"
import { DarkmodeState, selectDarkmodeActive, setDarkmode } from "./darkmodeSlice"
import { RootState } from "../../app/store";
import { CheckBox } from "grommet";

function DarkmodeSelector({ dark, setDarkmode }: Props) {
  return (<CheckBox checked={dark} label="Dark mode" onChange={event => setDarkmode(event.target.checked)}></CheckBox>);
}

function mapState(state: RootState) {
  return {
    dark: selectDarkmodeActive(state)
  };
}

const connector = connect(mapState, { setDarkmode });
type Props = ConnectedProps<typeof connector>
export default connector(DarkmodeSelector);