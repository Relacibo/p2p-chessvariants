import { Switch, useMantineColorScheme } from "@mantine/core";
import { useSelector } from "react-redux";
import { useDispatch } from "../../app/hooks";
import { selectDarkmodeActive, setDarkmode } from "./darkmodeSlice";
import { useEffect } from "react";

function DarkmodeSelector() {
  const dispatch = useDispatch();
  const dark = useSelector(selectDarkmodeActive);
  const { setColorScheme } = useMantineColorScheme();
  useEffect(() => {
    setColorScheme(dark ? "dark" : "light");
  }, [dark]);
  return (
    <Switch
      checked={dark}
      label="Dark mode"
      onChange={({ currentTarget: { checked } }) => {
        dispatch(setDarkmode(checked));
      }}
    />
  );
}

export default DarkmodeSelector;
