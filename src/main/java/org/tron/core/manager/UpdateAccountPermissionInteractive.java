package org.tron.core.manager;

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.tron.common.utils.ByteUtil.hexStringToIntegerList;
import static org.tron.common.utils.ByteUtil.integerListToHexString;
import static org.tron.common.utils.Utils.greenBoldHighlight;
import static org.tron.common.utils.Utils.redBoldHighlight;
import static org.tron.walletserver.WalletApi.addressValid;

import com.alibaba.fastjson.JSON;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import lombok.Getter;
import lombok.Setter;
import org.bouncycastle.util.encoders.Hex;
import org.tron.trident.proto.Chain.Transaction.Contract.ContractType;
import org.tron.trident.proto.Common;
import org.tron.trident.proto.Response;
import org.tron.walletserver.WalletApi;

public class UpdateAccountPermissionInteractive {
  private final Scanner scanner = new Scanner(System.in);
  private final PermissionData data = new PermissionData();
  private static final List<Integer> ALL_OPERATIONS = Arrays.asList(
      0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13,
      14, 15, 16, 17, 18, 19, 20, 30, 31, 32, 33,
      41, 42, 43, 44, 45, 46, 48, 49, 52, 53, 54,
      55, 56, 57, 58, 59
  );
  private static final List<Integer> AVAILABLE_OPERATIONS = Arrays.asList(
      0, 1, 2, 4, 5, 6, 8, 9, 10, 11, 12, 13,
      14, 15, 16, 17, 18, 19, 30, 31, 33,
      41, 42, 43, 44, 45, 46, 48, 49, 52, 53, 54,
      55, 56, 57, 58, 59
  );
  private static final Map<String, String> operationsMap = new HashMap<>();

  static {
    operationsMap.put("0", "Activate Account");
    operationsMap.put("1", "Transfer TRX");
    operationsMap.put("2", "Transfer TRC10");
    operationsMap.put("4", "Vote");
    operationsMap.put("5", "Apply to Become a SR Candidate");
    operationsMap.put("6", "Issue TRC10");
    operationsMap.put("8", "Update SR Info");
    operationsMap.put("9", "Participate in TRC10 Issuance");
    operationsMap.put("10", "Update Account Name");
    operationsMap.put("11", "TRX Stake (1.0)");
    operationsMap.put("12", "TRX Unstake (1.0)");
    operationsMap.put("13", "Claim Voting Rewards");
    operationsMap.put("14", "Unstake TRC10");
    operationsMap.put("15", "Update TRC10 Parameters");
    operationsMap.put("16", "Create Proposal");
    operationsMap.put("17", "Approve Proposal");
    operationsMap.put("18", "Cancel Proposal");
    operationsMap.put("19", "Set Account Id");
    operationsMap.put("30", "Create Smart Contract");
    operationsMap.put("31", "Trigger Smart Contract");
    operationsMap.put("33", "Update Contract Parameters");
    operationsMap.put("41", "Create Bancor Transaction");
    operationsMap.put("42", "Inject Assets into Bancor Transaction");
    operationsMap.put("43", "Withdraw Assets from Bancor Transaction");
    operationsMap.put("44", "Execute Bancor Transaction");
    operationsMap.put("45", "Update Contract Energy Limit");
    operationsMap.put("46", "Update Account Permissions");
    operationsMap.put("48", "Clear Contract ABI");
    operationsMap.put("49", "Update SR Commission Ratio");
    operationsMap.put("52", "Market Sell Asset");
    operationsMap.put("53", "Market Cancel Order");
    operationsMap.put("54", "TRX Stake (2.0)");
    operationsMap.put("55", "TRX Unstake (2.0)");
    operationsMap.put("56", "Withdraw Unstaked TRX");
    operationsMap.put("57", "Delegate Resources");
    operationsMap.put("58", "Reclaim Resources");
    operationsMap.put("59", "Cancel Unstake");
  }

  public String start(String address) {
    System.out.println("\n=== UpdateAccountPermission Interactive Mode ===");
    Response.Account account = WalletApi.queryAccount(WalletApi.decodeFromBase58Check(address));
    if (account == null || Response.Account.getDefaultInstance().equals(account)) {
      throw new IllegalArgumentException(redBoldHighlight("The account to which this address " + address + " belongs "
          + "does not exist in the current network. Please check."));
    }
    data.setOwnerAddress(address);

    data.setOwnerPermission(convert2PermissionProto(account.getOwnerPermission()));
    data.setWitnessPermission(convert2PermissionProto(account.getWitnessPermission()));
    List<Permission> activePermissions = account.getActivePermissionList().stream()
        .map(this::convert2PermissionProto).collect(Collectors.toList());
    data.setActivePermissions(activePermissions);
    while (true) {
      System.out.println("\nPlease enter the index(" + greenBoldHighlight("1-7") + ") to operate:");
      System.out.println("1. owner_permission");
      System.out.println("2. witness_permission");
      System.out.println("3. active_permissions");
      System.out.println("4. Add new active_permission");
      System.out.println("5. Delete active_permission");
      System.out.println("6. Show preview and Confirm");
      System.out.println("7. Exit");
      System.out.print("> ");
      String choice = scanner.nextLine().trim();

      switch (choice) {
        case "1":
          editPermission(data.getOwnerPermission(), "owner_permission");
          break;
        case "2":
          editPermission(data.getWitnessPermission(), "witness_permission");
          break;
        case "3":
          editActivePermissions();
          break;
        case "4":
          addActivePermission();
          break;
        case "5":
          deleteActivePermission();
          break;
        case "6":
          String result = showFinalSummary();
          if (!result.isEmpty()) {
            return result;
          }
          break;
        case "7":
          System.out.println("Exiting interactive mode.");
          throw new IllegalArgumentException("Already exited interactive mode.");
        default:
          System.out.println("Invalid option.");
      }
    }
  }

  private Permission convert2PermissionProto(Common.Permission protoPermission) {
    if (protoPermission == null || Common.Permission.getDefaultInstance().equals(protoPermission)) {
      return null;
    }
    Permission permission = new Permission();
    permission.setPermissionName(protoPermission.getPermissionName());
    permission.setThreshold(protoPermission.getThreshold());
    permission.setType(protoPermission.getTypeValue());
    List<Key> keys = protoPermission.getKeysList().stream().map(o -> new Key(WalletApi.encode58Check(o.getAddress().toByteArray()), o.getWeight())).collect(Collectors.toList());
    if (protoPermission.getType() == Common.Permission.PermissionType.Active) {
      permission.setOperations(Hex.toHexString(protoPermission.getOperations().toByteArray()));
    }
    permission.setKeys(keys);
    return permission;
  }

  /**
   * editPermission
   */
  private void editPermission(Permission permission, String name) {
    if (permission == null) {
      System.out.println("Permission is null, cannot edit.");
      return;
    }
    System.out.println("\nEditing " + name + " (enter 'q' to cancel anytime)...");
    System.out.print("Enter permission_name (current: " + permission.getPermissionName() + "): ");
    String pname = scanner.nextLine().trim();
    if ("q".equalsIgnoreCase(pname)) {
      System.out.println("Cancelled editing " + name + ".");
      return;
    }
    if (!pname.isEmpty()) permission.setPermissionName(pname);

    while (true) {
      System.out.print("Enter threshold (current: " + permission.getThreshold() + "): ");
      String th = scanner.nextLine().trim();
      if ("q".equalsIgnoreCase(th)) {
        System.out.println("Cancelled editing " + name + ".");
        return;
      }
      if (th.isEmpty()) break;
      try {
        long val = Long.parseLong(th);
        if (val <= 0) {
          System.out.println("Threshold must be positive.");
          continue;
        }
        permission.setThreshold(val);
        break;
      } catch (NumberFormatException e) {
        System.out.println("Invalid number, please try again or input 'q' to cancel.");
      }
    }

    editKeys(permission);
  }

  private void editKeys(Permission permission) {
    if (permission == null) return;
    while (true) {
      System.out.println("\nKeys(Authorized To) for " + permission.getPermissionName() + ":");
      int size = permission.getKeys().size();
      for (int i = 0; i < size; i++) {
        Key key = permission.getKeys().get(i);
        System.out.println((i + 1) + ". " + key.getAddress() + " (weight=" + key.getWeight() + ")");
      }
      System.out.println();
      System.out.println("1. Add key(Authorized To)");
      System.out.println("2. Modify key(Authorized To)");
      if (size > 1) {
        System.out.println("3. Delete key(Authorized To)");
      }
      System.out.println("4. Back");
      System.out.print("> ");
      String choice = scanner.nextLine().trim();

      switch (choice) {
        case "1":
          if (size >= 5) {
            System.out.println("Each active permission can only add 5 addresses at most.");
            continue;
          }
          if (permission.getType() == 1) {
            System.out.println("Witness permission's key count should be 1, adding keys is not allowed");
            continue;
          }
          System.out.print("Enter key(Authorized To) address (or 'q' to cancel): ");
          String addr = scanner.nextLine().trim();
          if ("q".equalsIgnoreCase(addr)) continue;
          if (addr.isEmpty()) {
            System.out.println("Address cannot be empty.");
            continue;
          }
          if (!addressValid(addr)) {
            System.out.println("Invalid address format. Please enter a valid Base58 address.");
            continue;
          }

          System.out.print("Enter key(Authorized To) weight (or 'q' to cancel): ");
          String weightInput = scanner.nextLine().trim();
          if ("q".equalsIgnoreCase(weightInput)) continue;
          int weight;
          try {
            weight = Integer.parseInt(weightInput);
            long threshold = permission.getThreshold();
            if (weight <= 0 || weight > threshold) {
              System.out.println("Weight must be greater than 0 and less than or equal to threshold(" + threshold + ").");
              continue;
            }
          } catch (NumberFormatException e) {
            System.out.println("Invalid weight. Please enter an integer number.");
            continue;
          }

          permission.getKeys().add(new Key(addr, weight));
          System.out.println("Added key: " + addr + " (weight=" + weight + ")");

          break;
        case "2":
          if (permission.getKeys().isEmpty()) {
            System.out.println("No keys(Authorized To) to modify.");
            continue;
          }
          System.out.print("Enter key(Authorized To) index to modify (or 'q' to cancel): ");
          String midxStr = scanner.nextLine().trim();
          if ("q".equalsIgnoreCase(midxStr)) continue;
          int midx;
          try {
            midx = Integer.parseInt(midxStr) - 1;
          } catch (NumberFormatException e) {
            System.out.println("Invalid index.");
            continue;
          }
          if (midx >= 0 && midx < size) {
            Key keyToEdit = permission.getKeys().get(midx);
            System.out.println("Editing key(Authorized To) #" + (midx + 1));
            System.out.print("New address (blank to keep current: " + keyToEdit.getAddress() + ", 'q' to cancel): ");
            String newAddr = scanner.nextLine().trim();
            if ("q".equalsIgnoreCase(newAddr)) continue;
            if (!newAddr.isEmpty()) {
              if (!addressValid(newAddr)) {
                System.out.println("Invalid address format. Skip changing address.");
              } else {
                keyToEdit.address = newAddr;
              }
            }

            System.out.print("New weight (blank to keep current: " + keyToEdit.getWeight() + ", 'q' to cancel): ");
            String newWeight = scanner.nextLine().trim();
            if ("q".equalsIgnoreCase(newWeight)) continue;
            if (!newWeight.isEmpty()) {
              try {
                long w = Long.parseLong(newWeight);
                long threshold = permission.getThreshold();
                if (w <= 0 || w > threshold) {
                  System.out.println("Weight must be > 0 and <= threshold(" + threshold + "). Skip changing weight.");
                } else {
                  keyToEdit.weight = w;
                }
              } catch (NumberFormatException e) {
                System.out.println("Invalid number. Skip changing weight.");
              }
            }

            System.out.println("Key(Authorized To) updated.");
          } else {
            System.out.println("Invalid index.");
          }

          break;
        case "3":
          if (permission.getType() == 1) {
            System.out.println("Witness permission's key count should be 1, deleting keys is not allowed");
            continue;
          }
          if (permission.getKeys().isEmpty()) {
            System.out.println("No keys(Authorized To) to delete.");
            continue;
          }
          System.out.print("Enter key(Authorized To) index to delete (or 'q' to cancel): ");
          String idxStr = scanner.nextLine().trim();
          if ("q".equalsIgnoreCase(idxStr)) continue;
          int idx;
          try {
            idx = Integer.parseInt(idxStr) - 1;
          } catch (NumberFormatException e) {
            System.out.println("Invalid index.");
            continue;
          }
          if (idx >= 0 && idx < size) {
            permission.getKeys().remove(idx);
            System.out.println("Key(Authorized To) removed.");
          } else {
            System.out.println("Invalid index.");
          }

          break;
        case "4":
          return;
        default:
          System.out.println("Invalid input.");
          break;
      }
    }
  }

  private void editActivePermissions() {
    List<Permission> actives = data.getActivePermissions();
    if (actives == null || actives.isEmpty()) {
      System.out.println("No active permissions. You can add one first.");
      return;
    }

    System.out.println("\nActive permissions:");
    for (int i = 0; i < actives.size(); i++) {
      printPermissionSummary(actives.get(i), i + 1);
      System.out.println("---------------------------------------------------");
    }

    System.out.print("Enter index to edit (or 'q' to cancel): ");
    String idxStr = scanner.nextLine().trim();
    if ("q".equalsIgnoreCase(idxStr)) {
      System.out.println("Cancelled.");
      return;
    }
    int idx;
    try {
      idx = Integer.parseInt(idxStr) - 1;
    } catch (NumberFormatException e) {
      System.out.println("Invalid index.");
      return;
    }
    if (idx < 0 || idx >= actives.size()) {
      System.out.println("Invalid index.");
      return;
    }

    Permission p = actives.get(idx);

    System.out.print("Enter new permission_name (current: " + p.getPermissionName() + ", 'q' to cancel): ");
    String pname = scanner.nextLine().trim();
    if ("q".equalsIgnoreCase(pname)) {
      System.out.println("Cancelled editing.");
      return;
    }
    if (!pname.isEmpty()) p.setPermissionName(pname);

    while (true) {
      System.out.print("Enter new threshold (current: " + p.getThreshold() + ", 'q' to cancel): ");
      String th = scanner.nextLine().trim();
      if ("q".equalsIgnoreCase(th)) {
        System.out.println("Cancelled editing.");
        return;
      }
      if (th.isEmpty()) break;
      try {
        long val = Long.parseLong(th);
        if (val <= 0) {
          System.out.println("Threshold must be positive.");
          continue;
        }
        p.setThreshold(val);
        break;
      } catch (NumberFormatException e) {
        System.out.println("Invalid number.");
      }
    }

    List<Integer> currentOps = hexStringToIntegerList(p.getOperations());
    Collections.sort(currentOps);

    while (true) {
      List<Integer> allowedOps = currentOps.stream()
          .filter(i -> operationsMap.get(String.valueOf(i)) != null).sorted().collect(Collectors.toList());
      System.out.println("\nCurrent allowed operations:");
      for (int i = 0; i < allowedOps.size(); i++) {
        int code = allowedOps.get(i);
        System.out.println((i + 1) + ". " + operationsMap.get(String.valueOf(code))
            + " -> " + ContractType.forNumber(code).name() + "(" + code + ")");
      }

      System.out.println("\nOperations editing (enter 'q' to finish editing operations):");
      System.out.println("1. Delete existing operation(s)");
      System.out.println("2. Add new operation(s)");
      System.out.println("3. Done");
      System.out.print("> ");
      String choice = scanner.nextLine().trim();
      if ("q".equalsIgnoreCase(choice) || "3".equals(choice)) {
        break;
      }

      if ("1".equals(choice)) {
        if (allowedOps.isEmpty()) {
          System.out.println("No operations to delete.");
          continue;
        }

        System.out.println("Current operations that can be deleted:");
        for (int i = 0; i < allowedOps.size(); i++) {
          int code = allowedOps.get(i);
          System.out.println((i + 1) + ". " + operationsMap.get(String.valueOf(code))
              + " -> " + ContractType.forNumber(code).name() + "(" + code + ")");
        }

        System.out.print("Enter indexes to delete (comma separated), or 'q' to cancel: ");
        String delInput = scanner.nextLine().trim();
        if ("q".equalsIgnoreCase(delInput)) continue;
        if (!delInput.matches("^[0-9]+(,[0-9]+)*$")) {
          System.out.println("Invalid format.");
          continue;
        }

        String[] parts = delInput.split(",");
        Set<Integer> toDelete = new HashSet<>();
        for (String part : parts) {
          try {
            int delIdx = Integer.parseInt(part.trim()) - 1;
            if (delIdx >= 0 && delIdx < allowedOps.size()) {
              toDelete.add(allowedOps.get(delIdx));
            } else {
              System.out.println("Ignored invalid index: " + (delIdx + 1));
            }
          } catch (NumberFormatException e) {
            System.out.println("Ignored invalid input: " + part);
          }
        }

        if (!toDelete.isEmpty()) {
          currentOps.removeAll(toDelete);
          System.out.println("Deleted selected operations.");
        } else {
          System.out.println("No valid operations selected for deletion.");
        }

      } else if ("2".equals(choice)) {
        List<Integer> available = new ArrayList<>();
        for (Integer op : AVAILABLE_OPERATIONS) {
          if (!currentOps.contains(op)) available.add(op);
        }
        if (available.isEmpty()) {
          System.out.println("No more operations to add.");
          continue;
        }

        System.out.println("Available operations to add:");
        for (int i = 0; i < available.size(); i++) {
          int code = available.get(i);
          System.out.println((i + 1) + ". " + operationsMap.get(String.valueOf(code))
              + " -> " + ContractType.forNumber(code).name() + "(" + code + ")");
        }

        System.out.print("Enter indexes to add (comma separated), or 'q' to cancel: ");
        String addInput = scanner.nextLine().trim();
        if ("q".equalsIgnoreCase(addInput)) continue;
        if (!addInput.matches("^[0-9]+(,[0-9]+)*$")) {
          System.out.println("Invalid format.");
          continue;
        }

        String[] parts = addInput.split(",");
        Set<Integer> toAdd = new LinkedHashSet<>();
        for (String part : parts) {
          try {
            int addIdx = Integer.parseInt(part.trim()) - 1;
            if (addIdx >= 0 && addIdx < available.size()) {
              toAdd.add(available.get(addIdx));
            } else {
              System.out.println("Ignored invalid index: " + (addIdx + 1));
            }
          } catch (NumberFormatException e) {
            System.out.println("Ignored invalid input: " + part);
          }
        }

        if (!toAdd.isEmpty()) {
          currentOps.addAll(toAdd);
          System.out.println("Added selected operations.");
        } else {
          System.out.println("No valid operations selected for addition.");
        }

      } else {
        System.out.println("Invalid input.");
      }
    }

    Set<Integer> uniqueOps = new LinkedHashSet<>(currentOps);
    currentOps = new ArrayList<>(uniqueOps);
    Collections.sort(currentOps);
    p.setOperations(integerListToHexString(currentOps));

    editKeys(p);
  }

  private void addActivePermission() {
    int size = data.getActivePermissions().size();
    if (size >= 8) {
      System.out.println("Each account can add up to 8 active permissions");
      return;
    }
    Permission p = new Permission();
    p.setType(2);

    System.out.print("Enter permission_name (or 'q' to cancel): ");
    String name = scanner.nextLine().trim();
    if ("q".equalsIgnoreCase(name)) {
      System.out.println("Cancelled adding active permission.");
      return;
    }
    p.setPermissionName(name);

    while (true) {
      System.out.print("Enter threshold (or 'q' to cancel): ");
      String th = scanner.nextLine().trim();
      if ("q".equalsIgnoreCase(th)) {
        System.out.println("Cancelled adding active permission.");
        return;
      }
      try {
        long t = Long.parseLong(th);
        if (t <= 0) {
          System.out.println("Threshold must be positive.");
        } else {
          p.setThreshold(t);
          break;
        }
      } catch (NumberFormatException e) {
        System.out.println("Invalid number.");
      }
    }

    System.out.println("Available operations:");
    for (int i = 0; i < AVAILABLE_OPERATIONS.size(); i++) {
      int op = AVAILABLE_OPERATIONS.get(i);
      System.out.println((i + 1) + ". " + operationsMap.get(String.valueOf(op)) + " -> "
          + ContractType.forNumber(op).name() + "(" + op + ")");
    }

    List<Integer> selectedOps = new ArrayList<>();
    String opsInput;

    while (true) {
      System.out.print("Enter indexes to allow (comma separated, e.g. 1,3,5) or 'q' to cancel: ");
      opsInput = scanner.nextLine().trim();
      if ("q".equalsIgnoreCase(opsInput)) {
        System.out.println("Cancelled adding active permission.");
        return;
      }

      if (opsInput.isEmpty()) {
        System.out.println("Operations cannot be empty. Please select at least one operation.");
        continue;
      }

      if (!opsInput.matches("^[0-9]+(,[0-9]+)*$")) {
        System.out.println("Invalid format. Please enter comma-separated numbers like: 1,2,3");
        continue;
      }

      String[] parts = opsInput.split(",");
      boolean valid = true;
      for (String part : parts) {
        int idx = Integer.parseInt(part.trim());
        if (idx < 1 || idx > AVAILABLE_OPERATIONS.size()) {
          System.out.println("Invalid index: " + idx + " (valid range: 1–" + AVAILABLE_OPERATIONS.size() + ")");
          valid = false;
          break;
        }
        selectedOps.add(AVAILABLE_OPERATIONS.get(idx - 1));
      }

      if (valid) break;
      else selectedOps.clear();
    }
    Set<Integer> uniqueOps = new LinkedHashSet<>(selectedOps);
    selectedOps = new ArrayList<>(uniqueOps);

    Collections.sort(selectedOps);
    p.setOperations(integerListToHexString(selectedOps));

    editKeys(p);

    data.getActivePermissions().add(p);
    System.out.println("Added new active permission: " + p.getPermissionName());
  }

  private void deleteActivePermission() {
    List<Permission> actives = data.getActivePermissions();
    if (actives.isEmpty()) {
      System.out.println("No active permissions to delete.");
      return;
    }

    for (int i = 0; i < actives.size(); i++) {
      printPermissionSummary(actives.get(i), i + 1);
      System.out.println("---------------------------------------------------");
    }
    if (actives.size() == 1) {
      System.out.println(redBoldHighlight("Currently, there is only one active permission, and deletion is not allowed."));
      return;
    }
    System.out.print("Enter index to delete, Enter " + greenBoldHighlight("b") + " to back: ");
    String idxStr = scanner.nextLine().trim();
    if ("b".equalsIgnoreCase(idxStr) || "q".equalsIgnoreCase(idxStr)) {
      return;
    }
    try {
      int idx = Integer.parseInt(idxStr) - 1;
      if (idx >= 0 && idx < actives.size()) {
        Permission removed = actives.remove(idx);
        System.out.println("Deleted active permission: " + removed.getPermissionName());
      } else {
        System.out.println("Invalid index.");
      }
    } catch (NumberFormatException e) {
      System.out.println("Invalid number.");
    }
  }

  private void printPermissionSummary(Permission p, int index) {
    System.out.println(greenBoldHighlight("#" + index) + "  " + p.getPermissionName());
    // === Operations ===
    List<Integer> ops = hexStringToIntegerList(p.getOperations());
    if (ops.isEmpty()) {
      System.out.println("  Operations : (none)");
    } else {
      String opsDisplay = ops.stream()
          .map(String::valueOf)
          .filter(operationsMap::containsKey)
          .map(operationsMap::get)
          .collect(Collectors.joining(", "));
      System.out.println("  Operations : " + opsDisplay);
    }
    System.out.println("  Threshold  : " + p.getThreshold());
    // === Authorized To ===
    List<Key> keys = p.getKeys();
    if (keys == null || keys.isEmpty()) {
      System.out.println("  Authorized To : (none)");
    } else {
      System.out.println("  Authorized To :");
      for (Key k : keys) {
        System.out.printf("      - Address: %-40s  Weight: %d%n",
            k.getAddress(), k.getWeight());
      }
    }
  }

  private String showFinalSummary() {
    while (true) {
      printPermissionData(data);

      System.out.print("\nDo you want to proceed with these changes? (Enter " + greenBoldHighlight("y/n") + ", n = return to edit): ");
      String input = scanner.nextLine().trim().toLowerCase();

      switch (input) {
        case "y":
          if (!validateAllPermissionWeights(data)) {
            return EMPTY;
          }
          System.out.println("Confirmed. Preparing final JSON...");
          return JSON.toJSONString(data.toTronJson());
        case "n":
          System.out.println("Returning to main menu for further edits...");
          return EMPTY;
        default:
          System.out.println("Invalid input. Please enter" + greenBoldHighlight("y/n"));
      }
    }
  }

  private boolean validateAllPermissionWeights(PermissionData data) {
    // valid owner permission
    if (!validateSinglePermission(data.getOwnerPermission())) {
      System.out.println(redBoldHighlight("Owner permission key weight sum must >= threshold!"));
      return false;
    }

    // valid active permissions
    for (Permission p : data.getActivePermissions()) {
      if (!validateSinglePermission(p)) {
        System.out.println(redBoldHighlight("Active permission '" + p.getPermissionName()
            + "' key weight sum must >= threshold!"));
        return false;
      }
    }

    return true;
  }

  private boolean validateSinglePermission(Permission p) {
    if (p == null) return false;
    int totalWeight = 0;
    for (Key k : p.getKeys()) {
      totalWeight += k.getWeight();
    }
    return totalWeight >= p.getThreshold();
  }


  private void printPermissionData(PermissionData data) {
    System.out.println("\n=============== Preview of Updated Account Permissions ===============\n");

    // --- Owner Permission ---
    Permission owner = data.getOwnerPermission();
    System.out.println("Owner Permission:");
    if (owner != null) {
      printPermissionDetail(owner);
    } else {
      System.out.println("  (none)");
    }

    // --- Witness Permission ---
    Permission witness = data.getWitnessPermission();
    System.out.println("\nWitness Permission:");
    if (witness != null) {
      printPermissionDetail(witness);
    } else {
      System.out.println("  (none)");
    }

    // --- Active Permissions ---
    List<Permission> actives = data.getActivePermissions();
    System.out.println("\nActive Permissions:");
    if (actives == null || actives.isEmpty()) {
      System.out.println("  (none)");
    } else {
      for (int i = 0; i < actives.size(); i++) {
        System.out.println(greenBoldHighlight("  #" + (i + 1)));
        printPermissionDetail(actives.get(i));
      }
    }
    System.out.println("=======================================================================");
  }

  private void printPermissionDetail(Permission p) {
    System.out.println("  Name       : " + p.getPermissionName());
    // === Operations ===
    List<Integer> ops = hexStringToIntegerList(p.getOperations());
    if (ops.isEmpty()) {
      System.out.println("  Operations : (none)");
    } else {
      System.out.println("  Operations :");
      for (Integer code : ops) {
        String name = operationsMap.get(String.valueOf(code));
        if (name == null) {
          continue;
        }
        System.out.printf("      - %-3d (%s)%n", code, name);
      }
    }
    System.out.println("  Threshold  : " + p.getThreshold());
    // === Authorized To ===
    List<Key> keys = p.getKeys();
    if (keys == null || keys.isEmpty()) {
      System.out.println("  Authorized To : (none)");
    } else {
      System.out.println("  Authorized To :");
      for (Key k : keys) {
        System.out.printf("      - Address: %-40s  Weight: %d%n",
            k.getAddress(), k.getWeight());
      }
    }
  }


  @Getter
  @Setter
  static class PermissionData {
    private String ownerAddress;
    private Permission ownerPermission = Permission.defaultOwner();
    private Permission witnessPermission = Permission.defaultWitness();
    private List<Permission> activePermissions = new ArrayList<>();

    public Map<String, Object> toTronJson() {
      Map<String, Object> json = new LinkedHashMap<>();
      json.put("owner_permission", ownerPermission.toJson());
      if (witnessPermission != null) {
        json.put("witness_permission", witnessPermission.toJson());
      }
      List<Map<String, Object>> list = new ArrayList<>();
      for (Permission p : activePermissions) list.add(p.toJson());
      json.put("active_permissions", list);
      return json;
    }
  }

  @Getter
  @Setter
  static class Permission {
    private int type;
    private String permissionName;
    private long threshold;
    private String operations;
    private List<Key> keys = new ArrayList<>();

    static Permission defaultOwner() {
      Permission p = new Permission();
      p.type = 0;
      p.permissionName = "owner";
      p.threshold = 1;
      p.keys.add(new Key("your_owner_address", 1));
      return p;
    }

    static Permission defaultWitness() {
      Permission p = new Permission();
      p.type = 1;
      p.permissionName = "witness";
      p.threshold = 1;
      p.keys.add(new Key("your_witness_address", 1));
      return p;
    }

    public Map<String, Object> toJson() {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("type", type);
      m.put("permission_name", permissionName);
      m.put("threshold", threshold);
      if (type == 2) m.put("operations", operations);
      List<Map<String, Object>> keyList = new ArrayList<>();
      for (Key k : keys) keyList.add(k.toJson());
      m.put("keys", keyList);
      return m;
    }
  }

  static class Key {
    private String address;
    private long weight;

    Key(String address, long weight) {
      this.address = address;
      this.weight = weight;
    }

    public Map<String, Object> toJson() {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("address", address);
      m.put("weight", weight);
      return m;
    }

    public String getAddress() {
      return address;
    }

    public long getWeight() {
      return weight;
    }
  }

}