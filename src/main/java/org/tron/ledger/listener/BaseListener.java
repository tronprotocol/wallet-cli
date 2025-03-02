package org.tron.ledger.listener;

import org.hid4java.HidServicesListener;
import org.hid4java.event.HidServicesEvent;

import java.util.concurrent.TimeUnit;

import static java.util.concurrent.TimeUnit.NANOSECONDS;
import static org.tron.ledger.console.ConsoleColor.ANSI_GREEN;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.ledger.console.ConsoleColor.ANSI_YELLOW;


public abstract class BaseListener implements HidServicesListener {
  /**
   * Invokes {@code unit.}{@link TimeUnit#sleep(long) sleep(sleepFor)}
   * uninterruptibly.
   */
  public static void sleepNoInterruption(int sleepSeconds) {
    boolean interrupted = false;
    boolean ledgerSignEnd = LedgerEventListener.getInstance().getLedgerSignEnd().get();
    try {
      long remainingNanos = TimeUnit.SECONDS.toNanos(sleepSeconds);
      long end = System.nanoTime() + remainingNanos;
      while (!ledgerSignEnd) {
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
    if (event.getHidDevice().getManufacturer().equals("Ledger")) {
      String product = event.getHidDevice().getProduct();

      System.out.println(ANSI_GREEN + "Device " + product + " found: " + event + ANSI_RESET);
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

  }

}
