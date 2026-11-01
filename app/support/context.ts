import { createContext, useContext } from "react";

export const AdminSupportContext = createContext({
  openHelp: () => {},
  closeHelp: () => {},
});
export const useAdminSupport = () => useContext(AdminSupportContext);
