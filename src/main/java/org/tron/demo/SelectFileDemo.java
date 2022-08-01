package org.tron.demo;

import org.apache.commons.lang.ArrayUtils;

import java.io.File;
import java.io.IOException;

public class SelectFileDemo {

  public static File selcetWalletFile(String filePath, String fileName) {
    File file = new File(filePath);
    if (!file.exists() || !file.isDirectory()) {
      return null;
    }

    File[] childFiles = file.listFiles();
    if (ArrayUtils.isEmpty(childFiles)) {
      return null;
    }

    if (childFiles.length > 1) {
      for (File child : childFiles) {
        String childName = child.getName();
        if (childName.indexOf(fileName) >= 0) {
          return child;
        }
      }
    }

    return null;
  }

  public static void createFile(String filePath, String fileName) throws IOException {
    File file = new File(filePath);
    if (!file.exists()) {
      if (!file.mkdir()) {
        throw new IOException("Make directory failed!");
      }
    } else {
      if (!file.isDirectory()) {
        if (file.delete()) {
          if (!file.mkdir()) {
            throw new IOException("Make directory failed!");
          }
        } else {
          throw new IOException("File exists and can not be deleted!");
        }
      }
    }

    File newFile = new File(file, fileName);
    if (newFile.exists()) {
      if (!newFile.isDirectory()) {
        return;
      }
      if (!file.delete()) {
        throw new IOException("File exists and can not be deleted!");
      }
    }
    if (!newFile.createNewFile()) {
      throw new IOException("File exists and can not be deleted!");
    }

  }

  public static void main(String[] args) throws IOException {
    String filePath = "FileTest";

    createFile(filePath, "test1File1");
    createFile(filePath, "test2File2");
    createFile(filePath, "test3File3");

    File file = selcetWalletFile(filePath, "test1File1");
    String fileName = file.getName();
    System.out.println("File name " + fileName);

    file = selcetWalletFile(filePath, "t1File");
    fileName = file.getName();
    System.out.println("File name " + fileName);

    file = selcetWalletFile(filePath, "test2");
    fileName = file.getName();
    System.out.println("File name " + fileName);

  }
}
