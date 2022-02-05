import { Switch } from "@mantine/core";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";
import { selectDarkmodeActive, setDarkmode } from "./darkmodeSlice";

function DarkmodeSelector() {
  const dispatch = useAppDispatch();
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
