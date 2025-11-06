package org.tron.core.viewer;

import java.util.Scanner;
import org.tron.core.service.AddressBookInteractive;
import org.tron.core.service.AddressBookService;

public class AddressBookView {
  private final Scanner scanner;
  AddressBookService addressBook = new AddressBookService();
  AddressBookInteractive interactive = new AddressBookInteractive(addressBook);

  public AddressBookView() {
    this.scanner = new Scanner(System.in);
  }

  public void viewAddressBook() {
    while (true) {
      addressBook.list();
      printMainMenu();
      String command = scanner.nextLine().trim().toLowerCase();

      switch (command) {
        case "1": interactive.addAddress(null); break;
        case "2": interactive.editAddress(); break;
        case "3": interactive.deleteAddress(); break;
        case "4": return;
        default: System.out.println("Invalid command");
      }
    }
  }

  private void printMainMenu() {
    System.out.println("\nMAIN MENU:");
    System.out.println("1. addAddress");
    System.out.println("2. editAddress");
    System.out.println("3. deleteAddress");
    System.out.println("4. exit");
    System.out.print("Select option: ");
  }
}
