import { View, Image, StyleSheet, Dimensions, Text, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useRef } from 'react';
import PagerView from 'react-native-pager-view';

const { width, height } = Dimensions.get('window');

type OnboardingCarouselProps = {
    onFinish: () => void;
};

const slides = [
    {
        image: require('../../assets/images/splash2.png'),
        title: 'Perfect Learning Match\nPowered by AI',
        description: 'Treyo connects learners and trainers through AI-powered tools for fast and personalized learning.',
        highlightWords: ['learners', 'trainers'],
    },
    {
        image: require('../../assets/images/splash3.png'),
        title: 'Trainers at the heart of smart learning.',
        description: 'Create and automate your courses, track your progress, and easily reach the right learners.',
        highlightWords: ['Trainers'],
        titleHighlight: 'Trainers',
    },
    {
        image: require('../../assets/images/splash4.png'),
        title: 'Empowering learners to go further.',
        description: "Get a personalized e-learning journey. treyo's AI matches you with ideal experts, and tailors content as you level up.",
        highlightWords: ['learners', "treyo's"],
        titleHighlight: 'learners',
    },
];

export default function OnboardingCarousel({ onFinish }: OnboardingCarouselProps) {
    const [currentPage, setCurrentPage] = useState(0);
    const pagerRef = useRef<PagerView>(null);
    const scrollX = useRef(new Animated.Value(0)).current;

    const renderHighlightedText = (text: string, highlightWords: string[]) => {
        const parts = text.split(new RegExp(`(${highlightWords.join('|')})`, 'gi'));
        return (
            <Text style={styles.description}>
                {parts.map((part, index) => {
                    const isHighlighted = highlightWords.some(
                        word => word.toLowerCase() === part.toLowerCase()
                    );
                    return (
                        <Text key={index} style={isHighlighted ? styles.green : undefined}>
                            {part}
                        </Text>
                    );
                })}
            </Text>
        );
    };

    const renderHighlightedTitle = (text: string, highlightWord?: string) => {
        if (!highlightWord) {
            return <Text style={styles.title}>{text}</Text>;
        }

        const parts = text.split(new RegExp(`(${highlightWord})`, 'gi'));
        return (
            <Text style={styles.title}>
                {parts.map((part, index) => {
                    const isHighlighted = part.toLowerCase() === highlightWord.toLowerCase();
                    return (
                        <Text key={index} style={isHighlighted ? styles.green : undefined}>
                            {part}
                        </Text>
                    );
                })}
            </Text>
        );
    };

    return (
        <View style={styles.container}>
            {/* Background */}
            <LinearGradient colors={['#160e45', '#02000e']} style={StyleSheet.absoluteFill} />
            <LinearGradient
                colors={['rgba(124,206,6,0.6)', 'rgba(124,206,6,0.25)', 'transparent']}
                style={styles.topGlow}
            />
            <LinearGradient
                colors={['transparent', 'rgba(124,206,6,0.25)', 'rgba(124,206,6,0.6)']}
                style={styles.bottomGlow}
            />
            <LinearGradient
                colors={['rgba(19,5,107,1)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.leftGlow}
            />
            <LinearGradient
                colors={['transparent', 'rgba(19,5,107,1)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.rightGlow}
            />

            {/* Pager */}
            <PagerView
                style={styles.pagerView}
                initialPage={0}
                onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
                onPageScroll={(e) => {
                    const position = e.nativeEvent.position;
                    const offset = e.nativeEvent.offset;
                    scrollX.setValue(position + offset);
                }}
                ref={pagerRef}
            >
                {slides.map((slide, index) => (
                    <View key={index} style={styles.page}>
                        <View style={styles.content}>
                            <Image source={slide.image} style={styles.image} resizeMode="contain" />
                            {renderHighlightedTitle(slide.title, slide.titleHighlight)}
                            {renderHighlightedText(slide.description, slide.highlightWords)}
                        </View>
                    </View>
                ))}
            </PagerView>

            {/* Bottom Section */}
            <View style={styles.bottomSection}>
                {/* Animated Dots */}
                <View style={styles.dotsContainer}>
                    {slides.map((_, index) => {
                        const widthAnim = scrollX.interpolate({
                            inputRange: [index - 1, index, index + 1],
                            outputRange: [10, 26, 10],
                            extrapolate: 'clamp',
                        });

                        const opacityAnim = scrollX.interpolate({
                            inputRange: [index - 1, index, index + 1],
                            outputRange: [0.3, 1, 0.3],
                            extrapolate: 'clamp',
                        });

                        return (
                            <Animated.View
                                key={index}
                                style={[
                                    styles.dot,
                                    {
                                        width: widthAnim,
                                        opacity: opacityAnim,
                                    },
                                ]}
                            />
                        );
                    })}
                </View>

                {/* Button */}
                {currentPage === slides.length - 1 ? (
                    <TouchableOpacity
                        style={styles.getStartedButton}
                        onPress={onFinish}
                        activeOpacity={0.8}
                    >
                        <LinearGradient colors={['#7cce06', '#6bb805']} style={styles.buttonGradient}>
                            <Text style={styles.buttonText}>Get Started</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={styles.skipButton} onPress={onFinish}>
                        <Text style={styles.skipText}>Skip</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#02000e',
    },
    pagerView: {
        flex: 1,
    },
    page: {
        flex: 1,
        justifyContent: 'center',
    },
    topGlow: {
        position: 'absolute',
        width: width,
        height: height * 0.35,
        top: -100,
    },
    bottomGlow: {
        position: 'absolute',
        width: width,
        height: height * 0.4,
        bottom: -180,
    },
    leftGlow: {
        position: 'absolute',
        width: width * 0.5,
        height: height,
        left: -100,
    },
    rightGlow: {
        position: 'absolute',
        width: width * 0.5,
        height: height,
        right: -100,
    },
    content: {
        paddingHorizontal: 30,
    },
    image: {
        width: width * 0.9,
        height: height * 0.35,
        alignSelf: 'center',
        marginTop: 60,
        marginBottom: 60,
    },
    title: {
        color: 'white',
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    description: {
        color: '#d1d1d1',
        fontSize: 16,
        lineHeight: 24,
    },
    green: {
        color: '#7CCE06',
        fontWeight: 'bold',
    },
    bottomSection: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    dotsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 30,
    },
    dot: {
        height: 10,
        borderRadius: 5,
        backgroundColor: '#7CCE06',
        marginHorizontal: 6,
    },
    getStartedButton: {
        width: width - 60,
        height: 56,
        borderRadius: 28,
        overflow: 'hidden',
        shadowColor: '#7cce06',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    buttonGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    skipButton: {
        paddingVertical: 12,
        paddingHorizontal: 24,
    },
    skipText: {
        color: '#999',
        fontSize: 16,
    },
});