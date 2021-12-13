import { connect, ConnectedProps } from "react-redux";
import { selectDarkmodeActive, setDarkmode } from "./darkmodeSlice";
import { RootState } from "../../app/store";
import { CheckBox } from "grommet";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";
import { toast } from "react-toastify";
import { useEffect } from "react";

function DarkmodeSelector() {
  const dispatch = useAppDispatch();
  const dark = useSelector(selectDarkmodeActive);
  return (
    <CheckBox
      checked={dark}
      label="Dark mode"
      onChange={({ target: { checked } }) => dispatch(setDarkmode(checked))}
    ></CheckBox>
  );
}

export default DarkmodeSelector;
