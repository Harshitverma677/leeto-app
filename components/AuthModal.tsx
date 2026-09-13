import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {
  registerWithUsername,
  loginWithEmail,
  sendPasswordReset,
  checkUsernameAvailable,
  validateUsernameFormat,
} from '../services/auth';
import { sendEmailOtp, verifyEmailOtp } from '../services/otp';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (username: string) => void;
  colors: any;
  isDarkMode: boolean;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  visible,
  onClose,
  onSuccess,
  colors,
  isDarkMode,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'otp'>(initialMode);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  // OTP fields
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otpInputRefs = useRef<Array<TextInput | null>>([]);

  // States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  useEffect(() => {
    setMode(initialMode);
    setErrorMsg('');
    setSuccessMsg('');
  }, [visible, initialMode]);

  useEffect(() => {
    if (resendCountdown > 0) {
      countdownTimerRef.current = setTimeout(() => {
        setResendCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    };
  }, [resendCountdown]);

  // Check username availability with debounce
  useEffect(() => {
    if (mode !== 'register' || !username.trim()) {
      setUsernameStatus('idle');
      return;
    }

    const validation = validateUsernameFormat(username);
    if (!validation.valid) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const available = await checkUsernameAvailable(username);
        setUsernameStatus(available ? 'available' : 'taken');
      } catch (_) {
        setUsernameStatus('idle');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username, mode]);

  const handleLogin = async () => {
    setErrorMsg('');
    if (!email.trim() || !password) {
      setErrorMsg('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const profile = await loginWithEmail(email, password);
      setLoading(false);
      onSuccess(profile.username);
      onClose();
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Login failed. Please check credentials.');
    }
  };

  const handleStartRegistration = async () => {
    setErrorMsg('');
    const cleanUser = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    const userValidation = validateUsernameFormat(cleanUser);
    if (!userValidation.valid) {
      setErrorMsg(userValidation.error || 'Invalid username.');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please provide a valid Gmail/email address.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const isAvailable = await checkUsernameAvailable(cleanUser);
      if (!isAvailable) {
        setLoading(false);
        setErrorMsg(`The username "${cleanUser}" is already taken.`);
        return;
      }

      // Send Email OTP
      const otpRes = await sendEmailOtp(cleanEmail);
      setLoading(false);

      if (otpRes.success) {
        setMode('otp');
        setResendCountdown(60);
        setSuccessMsg(`A 6-digit verification code was sent to ${cleanEmail}`);
      } else {
        setErrorMsg(otpRes.message);
      }
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Could not send verification code.');
    }
  };

  const handleVerifyAndRegister = async () => {
    setErrorMsg('');
    const enteredCode = otpDigits.join('');

    if (enteredCode.length !== 6) {
      setErrorMsg('Please enter the complete 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      // 1. Verify OTP
      await verifyEmailOtp(email, enteredCode);

      // 2. Create Account with unique username in Firestore
      const profile = await registerWithUsername(
        email,
        password,
        username,
        displayName || username
      );

      setLoading(false);
      Alert.alert('Account Verified', `Welcome to LeetDash, @${profile.username}!`);
      onSuccess(profile.username);
      onClose();
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Verification failed.');
    }
  };

  const handleResendOtp = async () => {
    if (resendCountdown > 0 || loading) return;
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await sendEmailOtp(email);
      setLoading(false);
      if (res.success) {
        setResendCountdown(60);
        setSuccessMsg(`New verification code sent to ${email}`);
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Could not resend code.');
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Email Required', 'Please enter your email in the email field first.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setLoading(false);
      Alert.alert('Password Reset Email Sent', `Instructions to reset your password were sent to ${email}.`);
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Reset Failed', err.message);
    }
  };

  const handleOtpDigitChange = (val: string, index: number) => {
    const cleanVal = val.replace(/[^0-9]/g, '');
    const updated = [...otpDigits];

    if (cleanVal.length > 1) {
      // Pasted full 6-digit code
      const digits = cleanVal.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        updated[i] = digits[i] || '';
      }
      setOtpDigits(updated);
      otpInputRefs.current[5]?.focus();
      return;
    }

    updated[index] = cleanVal;
    setOtpDigits(updated);

    if (cleanVal && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={[styles.modalCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                {mode === 'login' && 'Welcome Back'}
                {mode === 'register' && 'Create Account'}
                {mode === 'otp' && 'Verify Email'}
              </Text>
              <Text style={[styles.headerSub, { color: colors.textMuted }]}>
                {mode === 'login' && 'Sign in to sync your team leaderboard'}
                {mode === 'register' && 'Choose a unique handle and verify your email'}
                {mode === 'otp' && `Enter 6-digit code sent to ${email}`}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.subCardBg }]}
            >
              <Text style={[styles.closeBtnText, { color: colors.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Error & Success Messages */}
          {errorMsg ? (
            <View style={[styles.alertBox, { backgroundColor: `${colors.red}18`, borderColor: colors.red }]}>
              <Text style={[styles.alertText, { color: colors.red }]}>⚠️ {errorMsg}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View style={[styles.alertBox, { backgroundColor: `${colors.green}18`, borderColor: colors.green }]}>
              <Text style={[styles.alertText, { color: colors.green }]}>✓ {successMsg}</Text>
            </View>
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* LOGIN MODE */}
            {mode === 'login' && (
              <View style={styles.formContainer}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Email Address</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.subCardBg, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="name@gmail.com"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>Password</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.subCardBg, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                <TouchableOpacity
                  style={{ alignSelf: 'flex-end', marginTop: 8 }}
                  onPress={handleForgotPassword}
                >
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                    Forgot Password?
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.actionBtnText}>Sign In ⚡</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.switchRow}>
                  <Text style={[styles.switchText, { color: colors.textMuted }]}>
                    Don't have an account?{' '}
                  </Text>
                  <TouchableOpacity onPress={() => { setMode('register'); setErrorMsg(''); setSuccessMsg(''); }}>
                    <Text style={[styles.switchLink, { color: colors.primary }]}>Sign Up</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* REGISTER MODE */}
            {mode === 'register' && (
              <View style={styles.formContainer}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Unique Username</Text>
                  {usernameStatus === 'checking' && (
                    <Text style={{ color: colors.cyan, fontSize: 11, fontWeight: '700' }}>Checking...</Text>
                  )}
                  {usernameStatus === 'available' && (
                    <Text style={{ color: colors.green, fontSize: 11, fontWeight: '800' }}>✓ Available</Text>
                  )}
                  {usernameStatus === 'taken' && (
                    <Text style={{ color: colors.red, fontSize: 11, fontWeight: '800' }}>✕ Taken</Text>
                  )}
                </View>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.subCardBg, color: colors.textPrimary, borderColor: colors.border },
                    usernameStatus === 'available' && { borderColor: colors.green },
                    usernameStatus === 'taken' && { borderColor: colors.red },
                  ]}
                  placeholder="e.g. harshit123"
                  placeholderTextColor={colors.textMuted}
                  value={username}
                  onChangeText={(txt) => setUsername(txt.replace(/\s+/g, ''))}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>Gmail / Email</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.subCardBg, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="your.email@gmail.com"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>Display Name (Optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.subCardBg, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="e.g. Harshit Verma"
                  placeholderTextColor={colors.textMuted}
                  value={displayName}
                  onChangeText={setDisplayName}
                />

                <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>Password</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.subCardBg, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="Min 6 characters"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>Confirm Password</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.subCardBg, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="Re-enter password"
                  placeholderTextColor={colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
                  onPress={handleStartRegistration}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.actionBtnText}>Send Verification Code 📧</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.switchRow}>
                  <Text style={[styles.switchText, { color: colors.textMuted }]}>
                    Already have an account?{' '}
                  </Text>
                  <TouchableOpacity onPress={() => { setMode('login'); setErrorMsg(''); setSuccessMsg(''); }}>
                    <Text style={[styles.switchLink, { color: colors.primary }]}>Sign In</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* OTP VERIFICATION MODE */}
            {mode === 'otp' && (
              <View style={styles.formContainer}>
                <Text style={[styles.otpPrompt, { color: colors.textSecondary }]}>
                  Please enter the 6-digit OTP sent to <Text style={{ color: colors.primary, fontWeight: '800' }}>{email}</Text>
                </Text>

                <View style={styles.otpBoxesRow}>
                  {otpDigits.map((digit, idx) => (
                    <TextInput
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      style={[
                        styles.otpBox,
                        {
                          backgroundColor: colors.subCardBg,
                          color: colors.textPrimary,
                          borderColor: digit ? colors.primary : colors.border,
                        },
                      ]}
                      keyboardType="number-pad"
                      maxLength={idx === 0 ? 6 : 1}
                      value={digit}
                      onChangeText={(val) => handleOtpDigitChange(val, idx)}
                      onKeyPress={(e) => handleOtpKeyPress(e, idx)}
                      textAlign="center"
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
                  onPress={handleVerifyAndRegister}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.actionBtnText}>Verify & Create Account 🚀</Text>
                  )}
                </TouchableOpacity>

                {/* Resend button with countdown */}
                <View style={styles.resendRow}>
                  {resendCountdown > 0 ? (
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      Resend code in <Text style={{ color: colors.primary, fontWeight: '800' }}>{resendCountdown}s</Text>
                    </Text>
                  ) : (
                    <TouchableOpacity onPress={handleResendOtp} disabled={loading}>
                      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800' }}>
                        🔄 Resend Verification Code
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={{ alignSelf: 'center', marginTop: 14 }}
                  onPress={() => { setMode('register'); setErrorMsg(''); }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>
                    ← Edit Details
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 5, 10, 0.82)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 22,
    maxHeight: '90%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '900',
  },
  alertBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  alertText: {
    fontSize: 12,
    fontWeight: '700',
  },
  formContainer: {
    paddingBottom: 24,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  actionBtn: {
    marginTop: 20,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  switchText: {
    fontSize: 13,
  },
  switchLink: {
    fontSize: 13,
    fontWeight: '800',
  },
  otpPrompt: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 18,
  },
  otpBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 6,
  },
  otpBox: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    fontSize: 22,
    fontWeight: '900',
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 16,
  },
});
