package org.tron.core.service;

import static org.tron.common.utils.Utils.redBoldHighlight;
import static org.tron.walletserver.WalletApi.addressValid;

import java.util.List;
import java.util.Scanner;
import org.apache.commons.lang3.StringUtils;
import org.tron.core.dao.AddressEntry;

public class AddressBookInteractive {
  private final AddressBookService addressBook;
  private final Scanner scanner = new Scanner(System.in);

  public AddressBookInteractive(AddressBookService addressBook) {
    this.addressBook = addressBook;
  }

  /** Interactive add **/
  public void addAddress(String address) {
    System.out.print("Enter name: ");
    String name = scanner.nextLine().trim();
    if (name.isEmpty()) {
      System.out.println(redBoldHighlight("Error: Name cannot be empty"));
      return;
    }
    if (name.length() > 20) {
      System.out.println(redBoldHighlight("Error: The number of name characters cannot exceed 20"));
      return;
    }
    if (addressBook.findByName(name) != null) {
      System.out.println("Name already exists：" + redBoldHighlight(name));
      return;
    }
    if (StringUtils.isEmpty(address)) {
      System.out.print("Enter address: ");
      address = scanner.nextLine().trim();
      if (address.isEmpty()) {
        System.out.println(redBoldHighlight("Error: Address cannot be empty"));
        return;
      }
      if (addressBook.findByAddress(address) != null) {
        System.out.println("address already exists：" + redBoldHighlight(address));
        return;
      }
      if (!addressValid(address)) {
        System.out.println(redBoldHighlight("Error: Address format is invalid."));
        return;
      }
    }

    System.out.print("Enter note (optional): ");
    String note = scanner.nextLine().trim();

    addressBook.add(name, address, note);
  }

  /** Interactive edit **/
  public void editAddress() {
    List<AddressEntry> list = addressBook.getEntries();
    if (list.isEmpty()) {
      System.out.println("Address book is empty");
      return;
    }

    System.out.println("Select the address to edit:");
    for (int i = 0; i < list.size(); i++) {
      AddressEntry e = list.get(i);
      System.out.printf("%d. %s (%s) - %s%n", i + 1, e.getName(), e.getAddress(), e.getNote());
    }

    System.out.print("Enter number (0 to cancel): ");
    String input = scanner.nextLine().trim();
    if (input.equals("0")) {
      System.out.println("Canceled");
      return;
    }

    int index;
    try {
      index = Integer.parseInt(input) - 1;
    } catch (NumberFormatException e) {
      System.out.println("Error: Invalid input");
      return;
    }

    if (index < 0 || index >= list.size()) {
      System.out.println("Error: Number out of range");
      return;
    }

    AddressEntry entry = list.get(index);

    System.out.printf("Current name: %s%nNew name (press Enter to keep): ", entry.getName());
    String newName = scanner.nextLine().trim();
    if (newName.isEmpty()) newName = entry.getName();
    if (!newName.equalsIgnoreCase(entry.getName())) {
      if (newName.length() > 20) {
        System.out.println(redBoldHighlight("Error: The number of name characters cannot exceed 20"));
        return;
      }
      if (addressBook.findByName(newName) != null) {
        System.out.println("Name already exists：" + redBoldHighlight(newName));
        return;
      }
    }

    System.out.printf("Current address: %s%nNew address (press Enter to keep): ", entry.getAddress());
    String newAddress = scanner.nextLine().trim();
    if (newAddress.isEmpty()) newAddress = entry.getAddress();
    if (!newAddress.equalsIgnoreCase(entry.getAddress())) {
      if (addressBook.findByAddress(newAddress) != null) {
        System.out.println("address already exists：" + redBoldHighlight(newAddress));
        return;
      }
      if (!addressValid(newAddress)) {
        System.out.println(redBoldHighlight("Error: Address format is invalid."));
        return;
      }
    }

    System.out.printf("Current note: %s%nNew note (press Enter to keep): ", entry.getNote());
    String newNote = scanner.nextLine().trim();
    if (newNote.isEmpty()) newNote = entry.getNote();

    // Delete old entry and add updated one
    addressBook.delete(entry.getName());
    addressBook.add(newName, newAddress, newNote);

    System.out.println("Address updated: " + newName);
  }

  /** Interactive delete **/
  public void deleteAddress() {
    List<AddressEntry> list = addressBook.getEntries();
    if (list.isEmpty()) {
      System.out.println("Address book is empty");
      return;
    }

    System.out.println("Current address book:");
    for (int i = 0; i < list.size(); i++) {
      AddressEntry e = list.get(i);
      System.out.printf("%d. %s (%s) - %s%n", i + 1, e.getName(), e.getAddress(), e.getNote());
    }

    System.out.print("Enter number to delete (0 to cancel): ");
    String input = scanner.nextLine().trim();
    if (input.equals("0")) {
      System.out.println("Canceled");
      return;
    }

    int index;
    try {
      index = Integer.parseInt(input) - 1;
    } catch (NumberFormatException e) {
      System.out.println("Error: Invalid input");
      return;
    }

    if (index < 0 || index >= list.size()) {
      System.out.println("Error: Number out of range");
      return;
    }

    AddressEntry entry = list.get(index);
    System.out.printf("Confirm delete [%s] (%s)? (y/N): ", entry.getName(), entry.getAddress());
    String confirm = scanner.nextLine().trim();
    if (!confirm.equalsIgnoreCase("y")) {
      System.out.println("Delete canceled");
      return;
    }

    addressBook.delete(entry.getName());
    System.out.println("Deleted: " + entry.getName());
  }
}


