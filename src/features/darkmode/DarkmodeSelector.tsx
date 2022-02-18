import { Switch } from "@mantine/core";
import { useSelector } from "react-redux";
import { useDispatch } from "../../app/hooks";
import { selectDarkmodeActive, setDarkmode } from "./darkmodeSlice";

function DarkmodeSelector() {
  const dispatch = useDispatch();
  const dark = useSelector(selectDarkmodeActive);
  return (
    <Switch
      checked={dark}
      label="Dark mode"
      onChange={({ currentTarget: { checked } }) =>
        dispatch(setDarkmode(checked))
      }
    />
  );
}

export default DarkmodeSelector;
