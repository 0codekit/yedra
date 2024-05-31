export const helpScript = async () => {
  console.info(`usage: y COMMAND ...

Available commands:
    fix      Generate the src/router.ts file.
    help     Print this help menu.
    init     Init a new y project.
    new      Create a new endpoint.
    version  Print the installed version of y.`);
};
