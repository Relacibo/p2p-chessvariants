import { UnstyledButton, UnstyledButtonProps } from "@mantine/core";
import { Link, To } from "react-router-dom";

interface MainLinkProps {
  children: string;
  to: To;
  props?: UnstyledButtonProps;
}

function MainLink({ children, to, props }: MainLinkProps) {
  return (
    <UnstyledButton
      {...props}
      sx={(theme) => ({
        display: "block",
        width: "100%",
        padding: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        color:
          theme.colorScheme === "dark" ? theme.colors.dark[0] : theme.black,

        "&:hover": {
          backgroundColor:
            theme.colorScheme === "dark"
              ? theme.colors.dark[6]
              : theme.colors.gray[0],
        },
      })}
      component={Link}
      to={to}
    >
      {children}
    </UnstyledButton>
  );
}

export default MainLink;
