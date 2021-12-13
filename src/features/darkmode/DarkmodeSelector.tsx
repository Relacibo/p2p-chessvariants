import { selectDarkmodeActive, setDarkmode } from "./darkmodeSlice";
import { CheckBox } from "grommet";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";

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
