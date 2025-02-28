package org.tron.ledger.listener;

import org.hid4java.HidServices;
import org.hid4java.HidServicesListener;
import org.hid4java.event.HidServicesEvent;

import java.util.concurrent.TimeUnit;

import static java.util.concurrent.TimeUnit.NANOSECONDS;


public abstract class BaseListener implements HidServicesListener {

  public static final String ANSI_RESET = "\u001B[0m";
  public static final String ANSI_BLACK = "\u001B[30m";
  public static final String ANSI_RED = "\u001B[31m";
  public static final String ANSI_GREEN = "\u001B[32m";
  public static final String ANSI_YELLOW = "\u001B[33m";
  public static final String ANSI_BLUE = "\u001B[34m";
  public static final String ANSI_PURPLE = "\u001B[35m";
  public static final String ANSI_CYAN = "\u001B[36m";
  public static final String ANSI_WHITE = "\u001B[37m";

  public void waitAndShutdown(HidServices hidServices) {
    System.out.printf(ANSI_YELLOW + "Waiting 60s to demonstrate attach/detach handling. Watch for slow response after write if configured.%n" + ANSI_RESET);

    // Stop the main thread to demonstrate attach and detach events
    sleepNoInterruption();

    // Shut down and rely on auto-shutdown hook to clear HidApi resources
    System.out.printf(ANSI_YELLOW + "ledger sign listener shutdown...%n" + ANSI_RESET);
    hidServices.shutdown();
  }

  /**
   * Invokes {@code unit.}{@link TimeUnit#sleep(long) sleep(sleepFor)}
   * uninterruptibly.
   */
  public static void sleepNoInterruption() {
    boolean interrupted = false;
    try {
      long remainingNanos = TimeUnit.SECONDS.toNanos(60);
      long end = System.nanoTime() + remainingNanos;
      while (true) {
        try {
          // TimeUnit.sleep() treats negative timeouts just like zero.
          NANOSECONDS.sleep(remainingNanos);
          return;
        } catch (InterruptedException e) {
          interrupted = true;
          remainingNanos = end - System.nanoTime();
        }
      }
    } finally {
      if (interrupted) {
        Thread.currentThread().interrupt();
      }
    }
  }

  @Override
  public void hidDeviceAttached(HidServicesEvent event) {
    // manufacturer=Ledger
    if (event.getHidDevice().getManufacturer().equals("Ledger")) {
      String product = event.getHidDevice().getProduct();

      System.out.println(ANSI_GREEN + "Device "+product+" found: " + event + ANSI_RESET);
    }
  }

  @Override
  public void hidDeviceDetached(HidServicesEvent event) {
    System.out.println(ANSI_YELLOW + "Device detached: " + event + ANSI_RESET);
  }

  @Override
  public void hidFailure(HidServicesEvent event) {
    System.out.println(ANSI_RED + "HID failure: " + event + ANSI_RESET);
  }

  @Override
  public void hidDataReceived(HidServicesEvent event) {
    //System.out.printf(ANSI_PURPLE + "Data received:");
  }

}
