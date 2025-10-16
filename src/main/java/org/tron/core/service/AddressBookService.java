package org.tron.core.service;

import java.io.*;
import java.util.*;
import org.tron.core.dao.AddressEntry;

public class AddressBookService {
  private static final String DATA_DIR = "wallet_data";
  private static final String STORAGE_FILE = DATA_DIR + File.separator + "address_book.txt";
  private final File file;
  private final List<AddressEntry> entries = new ArrayList<>();

  public AddressBookService() {
    this.file = new File(STORAGE_FILE);
    load();
  }

  private void load() {
    entries.clear();
    if (!file.exists()) return;

    try (BufferedReader br = new BufferedReader(new FileReader(file))) {
      String line;
      while ((line = br.readLine()) != null) {
        if (line.trim().isEmpty()) continue;
        String[] parts = line.split(",", 3); // 最多分3段
        String name = parts.length > 0 ? parts[0].trim() : "";
        String address = parts.length > 1 ? parts[1].trim() : "";
        String note = parts.length > 2 ? parts[2].trim() : "";
        entries.add(new AddressEntry(name, address, note));
      }
    } catch (IOException e) {
      System.err.println("load address book failed:" + e.getMessage());
    }
  }

  private void save() {
    try {
      file.getParentFile().mkdirs();
      try (BufferedWriter bw = new BufferedWriter(new FileWriter(file))) {
        for (AddressEntry e : entries) {
          bw.write(e.toFileString());
          bw.newLine();
        }
      }
    } catch (IOException e) {
      System.err.println("save address book failed:" + e.getMessage());
    }
  }

  public void add(String name, String address, String note) {
    if (findByName(name) != null) {
      System.out.println("Name already exists：" + name);
      return;
    }
    entries.add(new AddressEntry(name, address, note));
    save();
    System.out.println("Address added:" + name);
  }

  public void edit(String name, String newAddress, String newNote) {
    AddressEntry entry = findByName(name);
    if (entry == null) {
      System.out.println("Name not found:" + name);
      return;
    }
    if (newAddress != null && !newAddress.isEmpty()) entry.setAddress(newAddress);
    if (newNote != null && !newNote.isEmpty()) entry.setNote(newNote);
    save();
    System.out.println("Updated address:" + name);
  }

  public void delete(String name) {
    boolean removed = entries.removeIf(e -> e.getName().equalsIgnoreCase(name));
    if (removed) {
      save();
      System.out.println("Deleted:" + name);
    } else {
      System.out.println("Not found:" + name);
    }
  }

  public void list() {
    if (entries.isEmpty()) {
      System.out.println("The address book is empty.");
      return;
    }
    System.out.printf("%-15s %-35s %s%n", "Name", "Address", "Note");
    System.out.println("--------------------------------------------------------------------------");
    entries.forEach(System.out::println);
  }

  public AddressEntry findByName(String name) {
    return entries.stream()
        .filter(e -> e.getName().equalsIgnoreCase(name))
        .findFirst()
        .orElse(null);
  }

  public List<AddressEntry> getEntries() {
    return entries;
  }
}

