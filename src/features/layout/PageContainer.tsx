import { Container } from "@mantine/core";
import type React from "react";

/** Consistent full-page wrapper used by all top-level views. */
export default function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <Container size="xl" pt="md" w="100%">
      {children}
    </Container>
  );
}
