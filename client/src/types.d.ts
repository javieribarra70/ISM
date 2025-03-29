// Add window interface extension for our timeout
interface Window {
  tabChangeTimeout?: ReturnType<typeof setTimeout>;
}